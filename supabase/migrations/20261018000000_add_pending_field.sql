-- Optional free-text "Pending" field on maintenance records — outstanding/
-- follow-up items not yet resolved, same \n-separated-lines-as-bullets
-- convention as detailed_steps/comment (see SPEC.md). No trigger/RLS
-- changes needed: nullable, no default, not involved in any business rule.
alter table public.maintenance_records
  add column if not exists pending text;
