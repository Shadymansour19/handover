-- Auto-purge soft-deleted rows after 30 days. Before this, a soft-deleted
-- record lived forever (recoverable via admin restore or direct DB
-- access) — this is a deliberate, explicit decision (2026-08-29) to switch
-- to a 30-day retention window instead. Past 30 days, purge is a real
-- DELETE: no admin restore is possible after that point.
--
-- Runs daily via pg_cron as the table owner (bypasses RLS entirely, same
-- as any owner-run maintenance job) — this is not something a client can
-- trigger, and it's not exposed as an RPC.
--
-- Covers both maintenance_records and operation_events for consistency,
-- even though operation_events has no delete UI yet (Phase 3) — the
-- deleted_at column already exists there, so the retention policy should
-- apply uniformly once it does, rather than needing a second migration
-- later to remember this.

create extension if not exists pg_cron;

create or replace function public.purge_soft_deleted_records()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.maintenance_records
  where deleted_at is not null and deleted_at < now() - interval '30 days';

  delete from public.operation_events
  where deleted_at is not null and deleted_at < now() - interval '30 days';
end;
$$;

-- Re-schedule idempotently: unschedule first if a prior run of this
-- migration already created it, so re-running never ends up with
-- duplicate jobs.
select cron.unschedule(jobid)
from cron.job
where jobname = 'purge-soft-deleted-records';

select cron.schedule(
  'purge-soft-deleted-records',
  '0 3 * * *', -- daily at 03:00 UTC — arbitrary low-traffic hour
  $$select public.purge_soft_deleted_records();$$
);
