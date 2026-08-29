-- Fix: soft-deleting via a plain client-side UPDATE always failed RLS —
-- "new row violates row-level security policy for table maintenance_records"
-- — for every user, including admins, regardless of ownership. Root cause:
-- Postgres implicitly enforces a table's SELECT policy against the
-- resulting row on UPDATE, in addition to the UPDATE policy's own WITH
-- CHECK, whether or not RETURNING/.select() is used. Our SELECT policy is
-- `deleted_at IS NULL` — so any update that sets deleted_at away from NULL
-- fails immediately, independent of who's doing it or what the UPDATE
-- policy says. No ownership/RLS-policy tweak can fix this; the write has
-- to happen via a function that bypasses RLS and does its own
-- authorization check instead. Confirmed empirically (not just in theory)
-- by temporarily loosening the SELECT policy and watching the same update
-- succeed.
--
-- operation_events has the identical shape (deleted_at-based SELECT
-- policy) and will hit the same bug the moment Phase 3 adds delete there —
-- fixing it now, ahead of need, while the cause is fresh.

create or replace function public.soft_delete_maintenance_record(record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
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

  if not (v_created_by = auth.uid() or public.is_admin()) then
    raise exception 'Not authorized to delete this record';
  end if;

  update public.maintenance_records
  set deleted_at = now()
  where id = record_id;
end;
$$;

grant execute on function public.soft_delete_maintenance_record(uuid) to authenticated;

-- Same pattern for operation_events, ready ahead of Phase 3.
create or replace function public.soft_delete_operation_event(event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
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

  if not (v_created_by = auth.uid() or public.is_admin()) then
    raise exception 'Not authorized to delete this event';
  end if;

  update public.operation_events
  set deleted_at = now()
  where id = event_id;
end;
$$;

grant execute on function public.soft_delete_operation_event(uuid) to authenticated;
