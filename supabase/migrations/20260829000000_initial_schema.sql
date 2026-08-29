-- Handover — initial schema: allowlist, reference data, core tables, RLS.
--
-- This is the canonical, deployed copy of the schema. It's applied
-- automatically by Supabase's GitHub integration when pushed to the linked
-- branch (project ref pfkpvkaybylrdnfwycxn, working directory ".").
-- See SPEC.md for the decisions and assumptions behind these choices.
--
-- Idempotent-ish via IF NOT EXISTS / CREATE OR REPLACE where practical, but
-- treat as a one-time initial migration, not a repeatable script — future
-- schema changes belong in new, separately-timestamped migration files
-- alongside this one, never edited in place after it has been deployed.

-- Note: no extensions needed. gen_random_uuid() has been built into
-- Postgres core since v13 (no pgcrypto required) — Supabase runs 15+.

-- =========================================================================
-- 1. Allowlist
-- =========================================================================
-- Pair this with disabling public sign-ups in Supabase Auth settings and
-- pre-inviting the ~10 known users from the dashboard. This table is a
-- second, independent layer of enforcement checked by every RLS policy
-- below, so it doesn't rely solely on the Auth-settings toggle staying off.

create table if not exists public.allowed_users (
  email text primary key check (email = lower(email))
);

comment on table public.allowed_users is
  'Second-layer allowlist for the ~10 known users. Not exposed to clients — '
  'checked only via is_allowed_user(). Maintain manually via SQL editor / dashboard.';

alter table public.allowed_users enable row level security;
-- Intentionally NO policies here: authenticated/anon clients get zero access
-- (service_role bypasses RLS and can still manage this table).

create or replace function public.is_allowed_user()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_users au
    where au.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- =========================================================================
-- 2. Reference data: systems & equipment
-- =========================================================================
-- Lookup tables rather than enums — see SPEC.md "Other assumptions" for why.

create table if not exists public.systems (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null,
  operation_tracked boolean not null default false,
  hide_when_empty boolean not null default false
);

create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.systems(id) on delete restrict,
  name text not null,
  sort_order int not null,
  is_generic boolean not null default false,
  unique (system_id, name)
);

alter table public.systems enable row level security;
alter table public.equipment enable row level security;

drop policy if exists systems_select on public.systems;
create policy systems_select on public.systems
  for select using (is_allowed_user());

drop policy if exists equipment_select on public.equipment;
create policy equipment_select on public.equipment
  for select using (is_allowed_user());

-- No insert/update/delete policies for systems/equipment: reference data is
-- managed by migrations / the dashboard (service_role), not by app clients.

-- Seed data (fixed lists from spec, in order) -----------------------------

insert into public.systems (name, sort_order, operation_tracked, hide_when_empty) values
  ('PHVII GTG',          1, true,  false),
  ('Main Compressor',    2, true,  false),
  ('Booster Compressor', 3, true,  false),
  ('Scarab GTG',         4, false, true),
  ('Workshop',           5, false, true),
  ('Others',             6, false, true)
on conflict (name) do nothing;

insert into public.equipment (system_id, name, sort_order, is_generic)
select s.id, e.name, e.sort_order, e.is_generic
from (values
  ('PHVII GTG',          'GT-8040', 1, false),
  ('PHVII GTG',          'GT-8050', 2, false),
  ('PHVII GTG',          'GT-8060', 3, false),
  ('PHVII GTG',          'Generic', 4, true),

  ('Main Compressor',    'GT-1710A', 1, false),
  ('Main Compressor',    'GT-1710B', 2, false),
  ('Main Compressor',    'GT-1710C', 3, false),
  ('Main Compressor',    'GT-1710D', 4, false),
  ('Main Compressor',    'GT-1710E', 5, false),
  ('Main Compressor',    'Generic',  6, true),

  ('Booster Compressor', 'GT-1050A', 1, false),
  ('Booster Compressor', 'GT-1050B', 2, false),
  ('Booster Compressor', 'Generic',  3, true),

  ('Scarab GTG',         'GT-8000', 1, false),
  ('Scarab GTG',         'GT-8010', 2, false),
  ('Scarab GTG',         'GT-8030', 3, false),
  ('Scarab GTG',         'Generic', 4, true),

  ('Workshop',           'Generic', 1, true),
  ('Others',             'Generic', 1, true)
) as e(system_name, name, sort_order, is_generic)
join public.systems s on s.name = e.system_name
on conflict (system_id, name) do nothing;

-- =========================================================================
-- 3. Enums for true fixed vocabularies
-- =========================================================================

do $$ begin
  create type public.work_status_enum as enum (
    'Permit Prepared',
    'Permit Submitted',
    'Permit Discussed',
    'Permit Ready to Open',
    'Work in Progress',
    'Work is Done',
    'Job Canceled',
    'Job Held',
    'Other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.operation_action_enum as enum (
    'Run',
    'Stop',
    'Trip',
    'Run Test',
    'Spin/Crank',
    'Swap'
  );
exception when duplicate_object then null;
end $$;

-- =========================================================================
-- 4. maintenance_records
-- =========================================================================

create table if not exists public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.systems(id) on delete restrict,
  equipment_id uuid not null references public.equipment(id) on delete restrict,

  start_date date not null default current_date,
  end_date date, -- see trigger below: auto-filled/locked based on work_status

  work_scope text not null,
  detailed_steps text, -- \n-separated lines, rendered as bullets client-side
  work_status public.work_status_enum not null,
  work_status_other text, -- free text when work_status = 'Other'
  comment text,

  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), -- satisfies spec's "last_updated"
  deleted_at timestamptz, -- soft delete

  constraint work_status_other_requires_other
    check (work_status <> 'Other' or work_status_other is not null)
);

create index if not exists idx_maintenance_records_system_equipment
  on public.maintenance_records (system_id, equipment_id) where deleted_at is null;
create index if not exists idx_maintenance_records_date_range
  on public.maintenance_records (start_date, end_date) where deleted_at is null;

-- Business rule: end_date auto-fills on transition into a terminal status,
-- stays user-editable after that, and is forced null while non-terminal.
-- Enforced here (not just client-side) so any client is bound by it.
create or replace function public.maintenance_record_biu()
returns trigger
language plpgsql
as $$
declare
  terminal_statuses public.work_status_enum[] := array['Work is Done','Job Canceled','Job Held']::public.work_status_enum[];
begin
  if new.work_status = any(terminal_statuses) then
    if new.end_date is null then
      new.end_date := current_date;
    end if;
  else
    new.end_date := null;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_maintenance_record_biu on public.maintenance_records;
create trigger trg_maintenance_record_biu
  before insert or update on public.maintenance_records
  for each row execute function public.maintenance_record_biu();

alter table public.maintenance_records enable row level security;

drop policy if exists maintenance_records_select on public.maintenance_records;
create policy maintenance_records_select on public.maintenance_records
  for select using (is_allowed_user() and deleted_at is null);

drop policy if exists maintenance_records_insert on public.maintenance_records;
create policy maintenance_records_insert on public.maintenance_records
  for insert with check (is_allowed_user() and created_by = auth.uid());

-- Own-records-only edit (see SPEC.md). "Delete" is implemented as this same
-- UPDATE path setting deleted_at — there is no separate DELETE grant.
drop policy if exists maintenance_records_update on public.maintenance_records;
create policy maintenance_records_update on public.maintenance_records
  for update using (is_allowed_user() and created_by = auth.uid())
  with check (is_allowed_user() and created_by = auth.uid());

-- =========================================================================
-- 5. operation_events
-- =========================================================================

create table if not exists public.operation_events (
  id uuid primary key default gen_random_uuid(),
  event_timestamp timestamptz not null default now(), -- spec's "timestamp"; reserved word avoided
  action public.operation_action_enum not null,
  system_id uuid not null references public.systems(id) on delete restrict,
  equipment_id uuid not null references public.equipment(id) on delete restrict, -- primary
  secondary_equipment_id uuid references public.equipment(id) on delete restrict, -- Swap only
  comment text,

  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz, -- soft delete

  constraint secondary_equipment_only_for_swap check (
    (action = 'Swap' and secondary_equipment_id is not null) or
    (action <> 'Swap' and secondary_equipment_id is null)
  )
);

create index if not exists idx_operation_events_equipment_time
  on public.operation_events (equipment_id, event_timestamp desc) where deleted_at is null;
create index if not exists idx_operation_events_secondary_time
  on public.operation_events (secondary_equipment_id, event_timestamp desc) where deleted_at is null;

-- Defense in depth: operation tracking only applies to the 3 tracked
-- systems, and never to a system's "Generic" equipment entry. The
-- Run/Stop/Trip/Swap *state* validation ("already Running" etc.) is left to
-- the application layer for now (see SPEC.md) — it needs to read the
-- equipment_status view below, which is a heavier check than fits neatly in
-- a lightweight trigger. Revisit if a second client makes app-layer-only
-- enforcement risky.
create or replace function public.operation_event_biu()
returns trigger
language plpgsql
as $$
declare
  sys_tracked boolean;
  eq_generic boolean;
  sec_generic boolean;
begin
  select operation_tracked into sys_tracked from public.systems where id = new.system_id;
  select is_generic into eq_generic from public.equipment where id = new.equipment_id;

  if not coalesce(sys_tracked, false) then
    raise exception 'System % does not support operation tracking', new.system_id;
  end if;
  if coalesce(eq_generic, false) then
    raise exception 'Operation events cannot target Generic equipment';
  end if;

  if new.secondary_equipment_id is not null then
    select is_generic into sec_generic from public.equipment where id = new.secondary_equipment_id;
    if coalesce(sec_generic, false) then
      raise exception 'Secondary equipment cannot be Generic';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_operation_event_biu on public.operation_events;
create trigger trg_operation_event_biu
  before insert or update on public.operation_events
  for each row execute function public.operation_event_biu();

alter table public.operation_events enable row level security;

drop policy if exists operation_events_select on public.operation_events;
create policy operation_events_select on public.operation_events
  for select using (is_allowed_user() and deleted_at is null);

drop policy if exists operation_events_insert on public.operation_events;
create policy operation_events_insert on public.operation_events
  for insert with check (is_allowed_user() and created_by = auth.uid());

drop policy if exists operation_events_update on public.operation_events;
create policy operation_events_update on public.operation_events
  for update using (is_allowed_user() and created_by = auth.uid())
  with check (is_allowed_user() and created_by = auth.uid());

-- =========================================================================
-- 6. Derived equipment status (view, not a stored column)
-- =========================================================================
-- Run -> Running, Stop/Trip -> Stopped, Swap -> primary Stopped + secondary
-- Running. Run Test / Spin / Crank are transient and excluded. No events ->
-- Stopped (default).

create or replace view public.equipment_status_events as
select
  equipment_id as eq_id,
  event_timestamp,
  id as event_id,
  case action
    when 'Run'  then 'Running'
    when 'Stop' then 'Stopped'
    when 'Trip' then 'Stopped'
    when 'Swap' then 'Stopped' -- primary side of a swap
  end as derived_status
from public.operation_events
where deleted_at is null and action in ('Run', 'Stop', 'Trip', 'Swap')
union all
select
  secondary_equipment_id as eq_id,
  event_timestamp,
  id as event_id,
  'Running' as derived_status
from public.operation_events
where deleted_at is null and action = 'Swap' and secondary_equipment_id is not null;

create or replace view public.equipment_status as
select
  eq.id as equipment_id,
  coalesce(
    (
      select ese.derived_status
      from public.equipment_status_events ese
      where ese.eq_id = eq.id
      order by ese.event_timestamp desc, ese.event_id desc
      limit 1
    ),
    'Stopped'
  ) as status
from public.equipment eq;

-- Views inherit the querying user's RLS on their underlying tables by
-- default (security_invoker semantics for simple views on Postgres 15+ /
-- Supabase's default). No separate grant needed beyond operation_events_select.

-- =========================================================================
-- 7. Manual setup steps (not SQL — do these in the Supabase dashboard)
-- =========================================================================
-- 1. Authentication > Providers > Email: enable "Email OTP" / magic link.
-- 2. Authentication > Settings: disable public sign-ups (only pre-invited
--    users should be able to receive a valid magic link).
-- 3. Authentication > Users: "Invite user" for each of the ~10 known users.
-- 4. Run: insert into public.allowed_users (email) values ('a@b.com'), (...);
--    for the same ~10 email addresses (case-insensitive, store lowercase).
