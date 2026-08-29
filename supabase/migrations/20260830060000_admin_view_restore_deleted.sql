-- Admins can now see soft-deleted maintenance_records (regular users still
-- can't) and restore one. Restore also goes through a SECURITY DEFINER RPC
-- rather than a plain client UPDATE — not strictly required for restore
-- itself (moving deleted_at -> NULL trivially satisfies the broadened
-- SELECT policy below), but kept symmetric with soft-delete's RPC pattern
-- so both write paths are equally easy to reason about and both do their
-- own explicit admin check rather than leaning on policy text alone.
--
-- operation_events is deliberately NOT touched here — that table's delete
-- UI doesn't exist yet (Phase 3), so this is scoped to what's actually
-- being used today. Revisit together when Phase 3 builds that UI.

drop policy if exists maintenance_records_select on public.maintenance_records;
create policy maintenance_records_select on public.maintenance_records
  for select using (is_allowed_user() and (deleted_at is null or is_admin()));

create or replace function public.restore_maintenance_record(record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can restore a deleted record';
  end if;

  update public.maintenance_records
  set deleted_at = null
  where id = record_id and deleted_at is not null;

  if not found then
    raise exception 'Record not found or not deleted';
  end if;
end;
$$;

grant execute on function public.restore_maintenance_record(uuid) to authenticated;
