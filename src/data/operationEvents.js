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
export async function fetchEquipmentHistory(equipmentId) {
  const { data, error } = await supabase
    .from('operation_events')
    .select(SELECT_COLUMNS)
    .or(`equipment_id.eq.${equipmentId},secondary_equipment_id.eq.${equipmentId}`)
    .order('event_timestamp', { ascending: false })

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
