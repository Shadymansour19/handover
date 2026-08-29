-- Allow signing in with either username or email. Supabase Auth's
-- signInWithPassword only accepts an email, so the client resolves a typed
-- username to its email via this RPC first, then signs in normally.
--
-- Callable by anon (no session exists yet at login time) — deliberately
-- narrow: returns only the matching email for an active user, nothing else
-- from the profile. Accepted tradeoff for a small (~10 user) internal tool:
-- this does let someone probe which usernames exist, which would be a
-- bigger concern on a public-facing app.

create or replace function public.lookup_email_by_username(p_username text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username = p_username and p.is_active
  limit 1;
$$;

grant execute on function public.lookup_email_by_username(text) to anon, authenticated;
