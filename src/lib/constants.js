// Fixed vocabularies shared between the form (recordModal) and the DB
// trigger (see supabase/migrations/20260829000000_initial_schema.sql) —
// keep these in sync with the `work_status_enum` Postgres type if it ever
// changes.
export const WORK_STATUSES = [
  'Permit Prepared',
  'Permit Submitted',
  'Permit Discussed',
  'Permit Ready to Open',
  'Work in Progress',
  'Work is Done',
  'Job Canceled',
  'Job Held',
  'Other',
]

export const TERMINAL_STATUSES = new Set(['Work is Done', 'Job Canceled', 'Job Held'])

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status)
}
