-- Admin can now grant a specific OTHER (non-creator) user edit/delete
-- access to an individual maintenance record or operation event, on top
-- of the existing "creator or admin" rule — SPEC.md "per-record access
-- grants". Two grant tables (one per record type, matching the existing
-- maintenance_records/operation_events split) rather than one polymorphic
-- table, consistent with how every other per-type concern in this schema
-- is split (soft-delete RPCs, restore RPCs, ...).

create table if not exists public.maintenance_record_access (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.maintenance_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid not null default auth.uid() references auth.users(id),
  granted_at timestamptz not null default now(),
  unique (record_id, user_id)
);

create table if not exists public.operation_event_access (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.operation_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid not null default auth.uid() references auth.users(id),
  granted_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists idx_maintenance_record_access_record on public.maintenance_record_access (record_id);
create index if not exists idx_maintenance_record_access_user on public.maintenance_record_access (user_id);
create index if not exists idx_operation_event_access_event on public.operation_event_access (event_id);
create index if not exists idx_operation_event_access_user on public.operation_event_access (user_id);

alter table public.maintenance_record_access enable row level security;
alter table public.operation_event_access enable row level security;

-- SELECT: a user can see their OWN grants (needed client-side to compute
-- "can I edit this" for the records/history lists) or, if admin, every
-- grant (needed for the "Manage Access" modal to know which checkboxes
-- are already checked for a given record). No update policy — a grant is
-- either present or absent, toggled via insert/delete, not edited in place.
drop policy if exists maintenance_record_access_select on public.maintenance_record_access;
create policy maintenance_record_access_select on public.maintenance_record_access
  for select using (is_allowed_user() and (user_id = auth.uid() or is_admin()));

drop policy if exists maintenance_record_access_insert on public.maintenance_record_access;
create policy maintenance_record_access_insert on public.maintenance_record_access
  for insert with check (is_admin());

drop policy if exists maintenance_record_access_delete on public.maintenance_record_access;
create policy maintenance_record_access_delete on public.maintenance_record_access
  for delete using (is_admin());

drop policy if exists operation_event_access_select on public.operation_event_access;
create policy operation_event_access_select on public.operation_event_access
  for select using (is_allowed_user() and (user_id = auth.uid() or is_admin()));

drop policy if exists operation_event_access_insert on public.operation_event_access;
create policy operation_event_access_insert on public.operation_event_access
  for insert with check (is_admin());

drop policy if exists operation_event_access_delete on public.operation_event_access;
create policy operation_event_access_delete on public.operation_event_access
  for delete using (is_admin());

-- =========================================================================
-- Extend the existing "own record or admin" UPDATE policies with the new
-- third option: an explicit per-record grant. Plain client-side UPDATEs
-- (editing scope/status/etc.) go through this policy directly — unlike
-- soft-delete, a normal edit never touches deleted_at, so it doesn't hit
-- the implicit-SELECT-policy-on-UPDATE gotcha documented in
-- 20260830050000_soft_delete_rpc.sql.
-- =========================================================================

drop policy if exists maintenance_records_update on public.maintenance_records;
create policy maintenance_records_update on public.maintenance_records
  for update using (
    is_allowed_user() and (
      created_by = auth.uid() or is_admin() or
      exists (
        select 1 from public.maintenance_record_access a
        where a.record_id = maintenance_records.id and a.user_id = auth.uid()
      )
    )
  )
  with check (
    is_allowed_user() and (
      created_by = auth.uid() or is_admin() or
      exists (
        select 1 from public.maintenance_record_access a
        where a.record_id = maintenance_records.id and a.user_id = auth.uid()
      )
    )
  );

drop policy if exists operation_events_update on public.operation_events;
create policy operation_events_update on public.operation_events
  for update using (
    is_allowed_user() and (
      created_by = auth.uid() or is_admin() or
      exists (
        select 1 from public.operation_event_access a
        where a.event_id = operation_events.id and a.user_id = auth.uid()
      )
    )
  )
  with check (
    is_allowed_user() and (
      created_by = auth.uid() or is_admin() or
      exists (
        select 1 from public.operation_event_access a
        where a.event_id = operation_events.id and a.user_id = auth.uid()
      )
    )
  );

-- =========================================================================
-- Same extension for soft_delete_*'s own inline authorization check (RPC,
-- bypasses RLS internally — see 20260830050000_soft_delete_rpc.sql for why
-- a plain client UPDATE can't be used for this one).
-- =========================================================================

create or replace function public.soft_delete_maintenance_record(record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
  v_has_grant boolean;
begin
  if not public.is_allowed_user() then
    raise exception 'Not authorized';
  end if;

  select created_by into v_created_by
  from public.maintenance_records
  where id = record_id and deleted_at is null;

  if v_created_by is null then
    raise exception 'Record not found or already deleted';
  end if;

  select exists (
    select 1 from public.maintenance_record_access
    where maintenance_record_access.record_id = soft_delete_maintenance_record.record_id
      and user_id = auth.uid()
  ) into v_has_grant;

  if not (v_created_by = auth.uid() or public.is_admin() or v_has_grant) then
    raise exception 'Not authorized to delete this record';
  end if;

  update public.maintenance_records
  set deleted_at = now()
  where id = record_id;
end;
$$;

create or replace function public.soft_delete_operation_event(event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
  v_has_grant boolean;
begin
  if not public.is_allowed_user() then
    raise exception 'Not authorized';
  end if;

  select created_by into v_created_by
  from public.operation_events
  where id = event_id and deleted_at is null;

  if v_created_by is null then
    raise exception 'Event not found or already deleted';
  end if;

  select exists (
    select 1 from public.operation_event_access
    where operation_event_access.event_id = soft_delete_operation_event.event_id
      and user_id = auth.uid()
  ) into v_has_grant;

  if not (v_created_by = auth.uid() or public.is_admin() or v_has_grant) then
    raise exception 'Not authorized to delete this event';
  end if;

  update public.operation_events
  set deleted_at = now()
  where id = event_id;
end;
$$;
