-- Admin can now permanently delete a maintenance record on demand, instead
-- of only waiting for the 30-day auto-purge
-- (20260830070000_purge_deleted_after_30_days.sql). Only works on a record
-- that's already soft-deleted (deleted_at is not null) — this is a
-- deliberate guard so the UI can only expose "permanently delete" as a
-- follow-on action next to Restore on an already-deleted row, not as a way
-- to skip the soft-delete step on an active record.
--
-- Same SECURITY DEFINER pattern as soft_delete/restore: bypasses RLS
-- internally, does its own explicit admin check.
--
-- operation_events intentionally not touched here — no delete UI exists
-- for it yet (Phase 3); revisit together then, same as the admin
-- view/restore migration before this one.

create or replace function public.hard_delete_maintenance_record(record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can permanently delete a record';
  end if;

  delete from public.maintenance_records
  where id = record_id and deleted_at is not null;

  if not found then
    raise exception 'Record not found, or not yet soft-deleted';
  end if;
end;
$$;

grant execute on function public.hard_delete_maintenance_record(uuid) to authenticated;
