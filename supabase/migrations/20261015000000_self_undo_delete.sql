-- Lets a record's own creator undo their OWN just-performed soft-delete,
-- within a short window (20s) of deleting it — "Self-service undo right
-- after deleting" (SPEC.md). Deliberately time-boxed via deleted_at
-- itself (not a standing "creator can always restore" permission): the
-- point is covering the common accidental-click case cheaply, not
-- reopening who gets to decide what comes back after a delete in
-- general — that stays admin-only beyond this window, same as before.
-- Restoring past the window (or by anyone other than the creator/admin)
-- still requires an admin via "Show deleted", unchanged.

create or replace function public.restore_maintenance_record(record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
  v_deleted_at timestamptz;
begin
  select created_by, deleted_at into v_created_by, v_deleted_at
  from public.maintenance_records
  where id = record_id and deleted_at is not null;

  if v_created_by is null then
    raise exception 'Record not found or not deleted';
  end if;

  if not (
    public.is_admin() or
    (v_created_by = auth.uid() and v_deleted_at > now() - interval '20 seconds')
  ) then
    raise exception 'Only an admin can restore a deleted record (the creator can only undo their own delete within a few seconds of it)';
  end if;

  update public.maintenance_records
  set deleted_at = null
  where id = record_id;
end;
$$;

create or replace function public.restore_operation_event(event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
  v_deleted_at timestamptz;
begin
  select created_by, deleted_at into v_created_by, v_deleted_at
  from public.operation_events
  where id = event_id and deleted_at is not null;

  if v_created_by is null then
    raise exception 'Event not found or not deleted';
  end if;

  if not (
    public.is_admin() or
    (v_created_by = auth.uid() and v_deleted_at > now() - interval '20 seconds')
  ) then
    raise exception 'Only an admin can restore a deleted event (the creator can only undo their own delete within a few seconds of it)';
  end if;

  update public.operation_events
  set deleted_at = null
  where id = event_id;
end;
$$;
