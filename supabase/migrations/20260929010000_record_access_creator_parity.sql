-- The record's own creator gets the same "Manage Access" powers as an
-- admin — grant/revoke another user's access to a record they created,
-- not just view/edit/delete it themselves. Extends
-- 20260929000000_record_access_grants.sql's three grant-table policies
-- (SELECT/INSERT/DELETE) with a third condition: the caller created the
-- record/event the grant row points at.
--
-- The SELECT policy matters here as much as INSERT/DELETE: without it, a
-- non-admin creator opening "Manage Access" for their own record would see
-- an empty checklist even if grants already existed (the old policy only
-- let them see grant rows where they're the GRANTEE — user_id = auth.uid()
-- — never rows granting access to someone else, which is exactly what
-- they need to see here).

drop policy if exists maintenance_record_access_select on public.maintenance_record_access;
create policy maintenance_record_access_select on public.maintenance_record_access
  for select using (
    is_allowed_user() and (
      user_id = auth.uid() or is_admin() or
      exists (
        select 1 from public.maintenance_records r
        where r.id = maintenance_record_access.record_id and r.created_by = auth.uid()
      )
    )
  );

drop policy if exists maintenance_record_access_insert on public.maintenance_record_access;
create policy maintenance_record_access_insert on public.maintenance_record_access
  for insert with check (
    is_admin() or exists (
      select 1 from public.maintenance_records r
      where r.id = record_id and r.created_by = auth.uid()
    )
  );

drop policy if exists maintenance_record_access_delete on public.maintenance_record_access;
create policy maintenance_record_access_delete on public.maintenance_record_access
  for delete using (
    is_admin() or exists (
      select 1 from public.maintenance_records r
      where r.id = maintenance_record_access.record_id and r.created_by = auth.uid()
    )
  );

drop policy if exists operation_event_access_select on public.operation_event_access;
create policy operation_event_access_select on public.operation_event_access
  for select using (
    is_allowed_user() and (
      user_id = auth.uid() or is_admin() or
      exists (
        select 1 from public.operation_events e
        where e.id = operation_event_access.event_id and e.created_by = auth.uid()
      )
    )
  );

drop policy if exists operation_event_access_insert on public.operation_event_access;
create policy operation_event_access_insert on public.operation_event_access
  for insert with check (
    is_admin() or exists (
      select 1 from public.operation_events e
      where e.id = event_id and e.created_by = auth.uid()
    )
  );

drop policy if exists operation_event_access_delete on public.operation_event_access;
create policy operation_event_access_delete on public.operation_event_access
  for delete using (
    is_admin() or exists (
      select 1 from public.operation_events e
      where e.id = operation_event_access.event_id and e.created_by = auth.uid()
    )
  );
