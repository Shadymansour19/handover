-- Foundation for admin user management. Two things a plain client-side
-- Supabase call CAN do safely (added here), and two things it fundamentally
-- CANNOT (creating an account, setting someone else's password — both
-- require the service_role key, which must never reach the browser; those
-- go through a new Edge Function instead, see supabase/functions/).
--
-- 1. profiles had NO update policy at all until now — role/username changes
--    were only ever done by hand via the SQL editor. Admins can now update
--    any profile directly.
-- 2. list_users(): admins need to see email addresses to manage accounts,
--    but email lives in auth.users, which RLS can't reach directly (it's
--    Supabase-managed, not ours). This SECURITY DEFINER function joins the
--    two and checks admin status itself — a non-admin gets zero rows back,
--    not an error (fine for a read; contrast with the Edge Function, which
--    raises real errors for a write attempted by a non-admin).

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (is_admin()) with check (is_admin());

create or replace function public.list_users()
returns table (
  id uuid,
  email text,
  username text,
  full_name text,
  role text,
  is_active boolean,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select u.id, u.email, p.username, p.full_name, p.role, p.is_active, u.created_at
  from auth.users u
  join public.profiles p on p.id = u.id
  where public.is_admin()
  order by p.username;
$$;

grant execute on function public.list_users() to authenticated;
