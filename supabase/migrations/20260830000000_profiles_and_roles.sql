-- Handover — auth pivot: profiles + roles, replacing the allowed_users
-- email allowlist. See SPEC.md "Decisions made (2026-08-29) — auth pivot".
--
-- Context: the previous migration (20260829000000_initial_schema.sql) set
-- up magic-link + an allowed_users email table. That's replaced here with
-- Supabase Auth email/password + a profiles table carrying a display
-- username and a role ('user' | 'admin'). Admin accounts get real extra
-- power: they can edit/delete any record, not just their own.
--
-- Manual dashboard step this migration depends on: Authentication >
-- Settings must have public sign-ups disabled, so the only way an
-- auth.users row gets created is an admin using Authentication > Users >
-- "Add user". This migration's trigger then auto-creates that user's
-- profiles row.

-- =========================================================================
-- 1. profiles
-- =========================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  role text not null default 'user' check (role in ('user', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Any logged-in provisioned user can see the list (needed to resolve
-- created_by -> a display name elsewhere in the UI). No client insert/update
-- policy: profiles are managed by the trigger below and by the admin
-- directly via the SQL editor for now (username/role edits are rare and
-- infrequent enough not to need an in-app admin screen yet).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (is_allowed_user());

-- Auto-create a profile row whenever an admin adds a new auth user, so the
-- admin only has to set username/role afterward instead of inserting the
-- row by hand. Defaults to role='user' — the one real admin account's role
-- must be set explicitly (see "Manual setup steps" at the bottom).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- 2. is_allowed_user() / is_admin() — replaces the allowed_users check
-- =========================================================================
-- Same function name/signature as before (create or replace), so no other
-- RLS policy anywhere needs to change. Now backed by profiles instead of an
-- email list: any admin-created account is automatically "allowed" unless
-- explicitly deactivated.

create or replace function public.is_allowed_user()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role = 'admin'
  );
$$;

-- =========================================================================
-- 3. Admin override on maintenance_records / operation_events UPDATE
-- =========================================================================
-- Regular users keep the existing own-records-only rule; an admin can now
-- also edit/soft-delete records they didn't create.

drop policy if exists maintenance_records_update on public.maintenance_records;
create policy maintenance_records_update on public.maintenance_records
  for update using (is_allowed_user() and (created_by = auth.uid() or is_admin()))
  with check (is_allowed_user() and (created_by = auth.uid() or is_admin()));

drop policy if exists operation_events_update on public.operation_events;
create policy operation_events_update on public.operation_events
  for update using (is_allowed_user() and (created_by = auth.uid() or is_admin()))
  with check (is_allowed_user() and (created_by = auth.uid() or is_admin()));

-- =========================================================================
-- 4. Retire allowed_users
-- =========================================================================
-- No longer referenced by is_allowed_user() as of section 2 above. Dropped
-- outright rather than left dangling — it was never populated (Phase 1's
-- manual setup hadn't reached that step yet), so there's no data to lose.

drop table if exists public.allowed_users;

-- =========================================================================
-- 5. Manual setup steps (not SQL — do these in the Supabase dashboard)
-- =========================================================================
-- 1. Authentication > Providers > Email: ensure Email provider is enabled
--    (it is by default); magic link is no longer used, password sign-in is.
-- 2. Authentication > Settings: keep public sign-ups disabled.
-- 3. Authentication > Users > "Add user": create your own account (the
--    admin) and each of the ~10 normal users, with an email + password
--    each. Hand out those credentials directly.
-- 4. In the SQL editor, promote your own account to admin (the trigger
--    above already created its profiles row with role='user' and a
--    username guessed from the email prefix — fix both):
--      update public.profiles set role = 'admin', username = 'yourname'
--      where id = (select id from auth.users where email = 'you@example.com');
-- 5. Optionally fix up the auto-guessed usernames for the other ~10 users
--    the same way (update ... where id = ...), or leave the email-prefix
--    default.
