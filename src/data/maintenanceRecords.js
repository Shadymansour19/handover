import { supabase } from '../supabaseClient.js'

const SELECT_COLUMNS =
  'id, system_id, equipment_id, start_date, end_date, work_scope, ' +
  'detailed_steps, work_status, work_status_other, comment, created_by, updated_at'

// Fetch maintenance records whose [start_date, end_date] range overlaps
// [from, to]. An open-ended end_date (still in progress) is treated as
// overlapping everything from start_date onward.
export async function fetchMaintenanceRecords({ from, to }) {
  const { data, error } = await supabase
    .from('maintenance_records')
    .select(SELECT_COLUMNS)
    .lte('start_date', to)
    .or(`end_date.is.null,end_date.gte.${from}`)
    .order('start_date', { ascending: false })

  if (error) throw error
  return data
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

// Soft delete: sets deleted_at rather than issuing a real DELETE (see
// SPEC.md "Delete behavior" decision) — RLS only grants UPDATE, not DELETE.
//
// .select() here is required for correctness, not just convenience: if RLS
// blocks the update (not the owner, not admin), PostgREST matches 0 rows
// and returns a plain success with no error — silently doing nothing. The
// UI already disables Delete for records you can't touch, but this is the
// difference between failing loudly and failing invisibly if that's ever
// bypassed (stale state, direct API call, etc).
export async function softDeleteMaintenanceRecord(id) {
  const { data, error } = await supabase
    .from('maintenance_records')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')

  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Record not found, or you do not have permission to delete it.')
  }
}
