import { supabase } from '../supabaseClient.js'

// Admin-granted per-record edit/delete access for a specific OTHER user,
// on top of the existing "creator or admin" rule — see SPEC.md "per-record
// access grants" and 20260929000000_record_access_grants.sql. One table
// per record type (matching maintenance_records/operation_events), so
// every function here takes a `recordType` of 'maintenance' | 'operation'
// to pick the right one rather than duplicating this whole file twice.
const TABLE = {
  maintenance: 'maintenance_record_access',
  operation: 'operation_event_access',
}

const ID_COLUMN = {
  maintenance: 'record_id',
  operation: 'event_id',
}

// All user ids currently granted access to one specific record — used to
// pre-check the right boxes when the admin opens "Manage Access" for it.
// RLS lets an admin see every grant row (not just their own), which is
// exactly what's needed here.
export async function fetchRecordAccess(recordType, recordId) {
  const { data, error } = await supabase
    .from(TABLE[recordType])
    .select('user_id')
    .eq(ID_COLUMN[recordType], recordId)

  if (error) throw error
  return data.map((row) => row.user_id)
}

// Every record id (of one type) the CURRENT user has been granted access
// to — used by mainView.js/historyModal.js to extend a regular user's
// canEdit check beyond their own records. RLS restricts a non-admin caller
// to their own grant rows automatically, so this needs no explicit
// user_id filter (and isn't called at all for an admin session, which
// doesn't need it — is_admin() already grants everything).
export async function fetchMyRecordAccessIds(recordType) {
  const idColumn = ID_COLUMN[recordType]
  const { data, error } = await supabase.from(TABLE[recordType]).select(idColumn)
  if (error) throw error
  return new Set(data.map((row) => row[idColumn]))
}

// Reconciles one record's grants to exactly `userIds` — diffs against the
// current grants (rather than blindly delete-all-then-insert-all) so an
// unchanged grant isn't dropped and re-added for no reason. Admin-only:
// enforced by RLS on both the insert and delete below, not just by this
// function only ever being called from the admin-only "Manage Access"
// modal.
export async function setRecordAccess(recordType, recordId, userIds) {
  const table = TABLE[recordType]
  const idColumn = ID_COLUMN[recordType]

  const current = new Set(await fetchRecordAccess(recordType, recordId))
  const next = new Set(userIds)

  const toAdd = [...next].filter((id) => !current.has(id))
  const toRemove = [...current].filter((id) => !next.has(id))

  if (toAdd.length > 0) {
    const { error } = await supabase.from(table).insert(toAdd.map((userId) => ({ [idColumn]: recordId, user_id: userId })))
    if (error) throw error
  }

  if (toRemove.length > 0) {
    const { error } = await supabase.from(table).delete().eq(idColumn, recordId).in('user_id', toRemove)
    if (error) throw error
  }
}
