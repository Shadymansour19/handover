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
