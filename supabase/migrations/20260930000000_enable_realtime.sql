-- Enables Supabase Realtime (postgres_changes) for the two tables the
-- frontend now subscribes to for live sync — see SPEC.md "live sync
-- between users" and lib/realtime.js. The `supabase_realtime` publication
-- already exists (created by Supabase itself) but starts with zero tables
-- in it — confirmed directly against the live DB before writing this.
--
-- No RLS changes needed: postgres_changes already re-evaluates each
-- table's own SELECT policy per subscribing client (using the NEW row for
-- INSERT/UPDATE, the OLD row for DELETE), so a client only ever receives
-- change events for rows they could already SELECT. One known
-- consequence, not a bug: a non-admin who couldn't see a row anyway never
-- gets an event for it — and specifically, since a soft-delete is an
-- UPDATE whose NEW row has deleted_at set, a non-admin's own SELECT
-- policy (deleted_at IS NULL) no longer matches that new row, so they
-- don't get notified their own record just got soft-deleted elsewhere.
-- Documented in SPEC.md rather than worked around.

-- No IF NOT EXISTS variant for this in Postgres — matches the same
-- exception-swallowing idempotency pattern initial_schema.sql already uses
-- for enum creation, so this migration is safely re-runnable too.
do $$ begin
  alter publication supabase_realtime add table public.maintenance_records;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.operation_events;
exception when duplicate_object then null;
end $$;
