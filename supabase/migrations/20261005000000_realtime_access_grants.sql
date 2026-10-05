-- Extends 20260930000000_enable_realtime.sql to the two access-grant
-- tables too — without this, a user just granted access to a record
-- (20260929000000_record_access_grants.sql) wouldn't see their new
-- Edit/Delete/Manage-Access ability light up live; only an unrelated
-- change to maintenance_records/operation_events would ever trigger a
-- refetch for them. Same idempotency pattern as that first migration
-- (no IF NOT EXISTS variant exists for this ALTER PUBLICATION form).

do $$ begin
  alter publication supabase_realtime add table public.maintenance_record_access;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.operation_event_access;
exception when duplicate_object then null;
end $$;
