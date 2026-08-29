-- Same admin view/restore/hard-delete parity for operation_events that
-- maintenance_records already has (20260830060000_admin_view_restore_deleted.sql,
-- 20260830080000_admin_hard_delete.sql). Deliberately deferred until now —
-- Phase 3's History modal UI didn't exist yet to expose it.

drop policy if exists operation_events_select on public.operation_events;
create policy operation_events_select on public.operation_events
  for select using (is_allowed_user() and (deleted_at is null or is_admin()));

create or replace function public.restore_operation_event(event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can restore a deleted event';
  end if;

  update public.operation_events
  set deleted_at = null
  where id = event_id and deleted_at is not null;

  if not found then
    raise exception 'Event not found or not deleted';
  end if;
end;
$$;

grant execute on function public.restore_operation_event(uuid) to authenticated;

create or replace function public.hard_delete_operation_event(event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can permanently delete an event';
  end if;

  delete from public.operation_events
  where id = event_id and deleted_at is not null;

  if not found then
    raise exception 'Event not found, or not yet soft-deleted';
  end if;
end;
$$;

grant execute on function public.hard_delete_operation_event(uuid) to authenticated;
