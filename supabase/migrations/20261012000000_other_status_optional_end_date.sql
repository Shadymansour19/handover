-- Work status "Other" can now have an optional end date — set it if the
-- work actually concluded, or leave it empty for "still ongoing" (SPEC.md
-- "Other status: optional end date"). Previously, maintenance_record_biu
-- treated every non-terminal status (Work is Done/Job Canceled/Job Held
-- are the only terminal ones) identically: force-null end_date on every
-- write, server-side, regardless of what the client sent. That's still
-- correct for the genuinely "in progress" statuses (Permit Prepared/
-- Submitted/Discussed/Ready to Open, Work in Progress) — there's no
-- "ongoing but I want to pick an end date anyway" concept for those — but
-- "Other" is a free-text catch-all that doesn't fit that assumption.
--
-- Terminal statuses are unchanged: still auto-fill end_date to today if
-- left empty on transitioning in. "Other" gets a third branch instead:
-- whatever end_date the client sent (including null) passes through
-- untouched — no auto-fill, no forced null.

create or replace function public.maintenance_record_biu()
returns trigger
language plpgsql
as $$
declare
  terminal_statuses public.work_status_enum[] := array['Work is Done','Job Canceled','Job Held']::public.work_status_enum[];
begin
  if new.work_status = any(terminal_statuses) then
    if new.end_date is null then
      new.end_date := current_date;
    end if;
  elsif new.work_status = 'Other' then
    null; -- pass through whatever end_date the client sent, including null
  else
    new.end_date := null;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;

  return new;
end;
$$;
