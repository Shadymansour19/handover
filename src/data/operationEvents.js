import { supabase } from '../supabaseClient.js'

const SELECT_COLUMNS =
  'id, event_timestamp, action, system_id, equipment_id, secondary_equipment_id, ' +
  'comment, created_by, deleted_at, updated_at'

// equipment_id -> 'Running' | 'Stopped', derived server-side from event
// history (see the equipment_status view, 20260829000000_initial_schema.sql,
// fixed for RLS in 20260830010000_fix_view_rls_bypass.sql).
export async function fetchEquipmentStatuses() {
  const { data, error } = await supabase.from('equipment_status').select('equipment_id, status')
  if (error) throw error
  return new Map(data.map((row) => [row.equipment_id, row.status]))
}

// All events for one unit, as either primary or secondary (Swap) — full
// history, not date-range-filtered. Spec: "History button... opens a modal
// listing ALL operation events for that unit."
//
// includeDeleted only actually returns anything extra for an admin — RLS
// hides deleted rows from everyone else regardless of this flag (see
// 20260830090000_admin_view_restore_operation_events.sql), same as
// maintenance records.
export async function fetchEquipmentHistory(equipmentId, { includeDeleted = false } = {}) {
  let query = supabase
    .from('operation_events')
    .select(SELECT_COLUMNS)
    .or(`equipment_id.eq.${equipmentId},secondary_equipment_id.eq.${equipmentId}`)
    .order('event_timestamp', { ascending: false })

  if (!includeDeleted) {
    query = query.is('deleted_at', null)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

// Events whose date falls within [from, to] (both local calendar days) —
// spec: "operation events shown if their date falls in range", unlike
// maintenance records' start/end overlap check. Not scoped to one
// equipment — like fetchMaintenanceRecords, callers group the flat result
// by equipment_id/secondary_equipment_id themselves
// (lib/combinedTimeline.js).
export async function fetchOperationEvents({ from, to, includeDeleted = false }) {
  const fromLocalStart = new Date(`${from}T00:00:00`).toISOString()
  const toLocalEnd = new Date(`${to}T23:59:59.999`).toISOString()

  let query = supabase
    .from('operation_events')
    .select(SELECT_COLUMNS)
    .gte('event_timestamp', fromLocalStart)
    .lte('event_timestamp', toLocalEnd)
    .order('event_timestamp', { ascending: false })

  if (!includeDeleted) {
    query = query.is('deleted_at', null)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

// `fields`: event_timestamp, action, system_id, equipment_id,
// secondary_equipment_id (Swap only), comment. created_by defaults to
// auth.uid() server-side. The operation_event_biu trigger rejects
// untracked systems / Generic equipment independently of the client-side
// filtering in lib/equipmentStatus.js.
export async function createOperationEvent(fields) {
  const { data, error } = await supabase
    .from('operation_events')
    .insert(fields)
    .select(SELECT_COLUMNS)
    .single()

  if (error) throw error
  return data
}

export async function updateOperationEvent(id, fields) {
  const { data, error } = await supabase
    .from('operation_events')
    .update(fields)
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single()

  if (error) throw error
  return data
}

// RPC, not a plain UPDATE — same reason as maintenance records (see
// SPEC.md "Postgres/RLS gotcha found in Phase 2"): Postgres implicitly
// re-checks the SELECT policy (deleted_at IS NULL) against the row an
// UPDATE would produce, so a direct client UPDATE setting deleted_at
// always fails RLS regardless of ownership. soft_delete_operation_event
// was already added pre-emptively in 20260830050000_soft_delete_rpc.sql.
export async function softDeleteOperationEvent(id) {
  const { error } = await supabase.rpc('soft_delete_operation_event', {
    event_id: id,
  })

  if (error) throw error
}

// Admin-only — restore_operation_event() checks this server-side too.
export async function restoreOperationEvent(id) {
  const { error } = await supabase.rpc('restore_operation_event', {
    event_id: id,
  })

  if (error) throw error
}

// Admin-only, and only on an already soft-deleted event — enforced
// server-side. Irreversible; otherwise the on-demand version of the 30-day
// auto-purge (20260830070000_purge_deleted_after_30_days.sql).
export async function hardDeleteOperationEvent(id) {
  const { error } = await supabase.rpc('hard_delete_operation_event', {
    event_id: id,
  })

  if (error) throw error
}
