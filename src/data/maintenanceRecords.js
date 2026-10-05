import { supabase } from '../supabaseClient.js'

const SELECT_COLUMNS =
  'id, system_id, equipment_id, start_date, end_date, work_scope, ' +
  'detailed_steps, work_status, work_status_other, comment, created_by, ' +
  'deleted_at, updated_at'

// PostgREST's `or=(...)` filter syntax treats `,`/`(`/`)` as structural
// (splitting/grouping conditions), so a search term containing any of
// those needs its value wrapped in double quotes to be taken literally —
// backslash-escaping alone does NOT work here (confirmed directly against
// the live REST endpoint: an escaped comma still failed to parse; a
// double-quoted value with a raw comma/paren inside it worked). The
// quoted value's own backslashes/quotes then need their own escaping.
function escapeIlikeTerm(term) {
  return term.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

// Fetch maintenance records whose [start_date, end_date] range overlaps
// [from, to]. An open-ended end_date (still in progress) is treated as
// overlapping everything from start_date onward. `search`, if given,
// additionally requires a case-insensitive substring match in
// work_scope/detailed_steps/comment (one `or=(...)` group, ANDed with the
// date-range `or=(...)` group above it — confirmed directly against the
// live REST endpoint that two separate .or() calls combine this way,
// rather than the second overwriting the first).
//
// includeDeleted only actually returns anything extra for an admin — RLS
// hides deleted rows from everyone else regardless of this flag (see
// 20260830060000_admin_view_restore_deleted.sql), so it's safe to pass
// through without checking the caller's role here.
export async function fetchMaintenanceRecords({ from, to, includeDeleted = false, search = '' }) {
  let query = supabase
    .from('maintenance_records')
    .select(SELECT_COLUMNS)
    .lte('start_date', to)
    .or(`end_date.is.null,end_date.gte.${from}`)
    .order('start_date', { ascending: false })

  if (!includeDeleted) {
    query = query.is('deleted_at', null)
  }

  const trimmedSearch = search.trim()
  if (trimmedSearch) {
    const pattern = `"*${escapeIlikeTerm(trimmedSearch)}*"`
    query = query.or(`work_scope.ilike.${pattern},detailed_steps.ilike.${pattern},comment.ilike.${pattern}`)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

// Distinct `work_scope` values previously used for this exact equipment,
// most recent first — backs recordModal.js's "+ New Record" autocomplete
// (a <datalist>, not a generative/AI suggestion: SPEC.md "autocomplete
// from history, not a generative model" explains why). Maintenance on a
// given unit is often recurring/near-identical in wording ("Borescope
// Inspection" etc.), so this is scoped to just that equipment rather than
// every record in the system — a global list would be longer and less
// relevant. Visible across every user's records, not just the caller's
// own (maintenance_records_select has no created_by restriction, unlike
// the update policy) — deliberate: the point is "what's commonly written
// for this unit," not "what I personally wrote before."
export async function fetchPriorWorkScopes(equipmentId, { limit = 20 } = {}) {
  const { data, error } = await supabase
    .from('maintenance_records')
    .select('work_scope')
    .eq('equipment_id', equipmentId)
    .is('deleted_at', null)
    .order('start_date', { ascending: false })
    .limit(100)

  if (error) throw error

  // No server-side DISTINCT via supabase-js's query builder — this table
  // is small enough per equipment that fetching a reasonable window and
  // deduplicating client-side (preserving most-recent-first order) is
  // simpler than reaching for an RPC just for this.
  const seen = new Set()
  const distinct = []
  for (const { work_scope } of data) {
    if (seen.has(work_scope)) continue
    seen.add(work_scope)
    distinct.push(work_scope)
    if (distinct.length >= limit) break
  }
  return distinct
}

// `fields` is whatever the form collected — start_date, end_date,
// system_id, equipment_id, work_scope, detailed_steps, work_status,
// work_status_other, comment. created_by/end_date auto-fill are handled
// server-side (default auth.uid(), the maintenance_record_biu trigger).
export async function createMaintenanceRecord(fields) {
  const { data, error } = await supabase
    .from('maintenance_records')
    .insert(fields)
    .select(SELECT_COLUMNS)
    .single()

  if (error) throw error
  return data
}

export async function updateMaintenanceRecord(id, fields) {
  const { data, error } = await supabase
    .from('maintenance_records')
    .update(fields)
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single()

  if (error) throw error
  return data
}

// Soft delete goes through an RPC (SECURITY DEFINER function), not a plain
// client-side UPDATE — see 20260830050000_soft_delete_rpc.sql for why: a
// direct UPDATE setting deleted_at always fails RLS, for every user
// including admins, because Postgres implicitly re-checks the table's
// SELECT policy (`deleted_at IS NULL`) against the row an UPDATE would
// produce. The RPC bypasses RLS internally and does its own authorization
// check (same own-record-or-admin rule) instead.
export async function softDeleteMaintenanceRecord(id) {
  const { error } = await supabase.rpc('soft_delete_maintenance_record', {
    record_id: id,
  })

  if (error) throw error
}

// Admin-only — restore_maintenance_record() checks this server-side too,
// so this isn't the real enforcement, just avoids a round-trip for a
// request that would always be rejected.
export async function restoreMaintenanceRecord(id) {
  const { error } = await supabase.rpc('restore_maintenance_record', {
    record_id: id,
  })

  if (error) throw error
}

// Admin-only, and only on an already soft-deleted record — the RPC
// enforces both server-side. Irreversible: a real DELETE, not another
// deleted_at update. Otherwise identical role to the 30-day auto-purge
// (20260830070000_purge_deleted_after_30_days.sql), just on demand.
export async function hardDeleteMaintenanceRecord(id) {
  const { error } = await supabase.rpc('hard_delete_maintenance_record', {
    record_id: id,
  })

  if (error) throw error
}
