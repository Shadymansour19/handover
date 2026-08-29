// Pure logic for the Operation tab's "auto-filtered dropdown" behavior and
// pre-submit validation (SPEC.md "operation_events" validation rules).
// Doesn't touch the network — takes an equipment-status lookup (from
// data/operationEvents.js's fetchEquipmentStatuses()) as plain input.

// What status the primary equipment must currently be in for each action
// to be allowed. Swap's secondary equipment has its own separate rule
// (must be Stopped) — see SECONDARY_REQUIRED_STATUS below.
const REQUIRED_STATUS_BY_ACTION = {
  Run: 'Stopped',
  'Run Test': 'Stopped',
  'Spin/Crank': 'Stopped',
  Stop: 'Running',
  Trip: 'Running',
  Swap: 'Running',
}

const SECONDARY_REQUIRED_STATUS = 'Stopped'

export function getStatus(equipmentStatuses, equipmentId) {
  // No events yet -> "Stopped" is the documented default (SPEC.md "All
  // units start Stopped with no events") — equipment_status view already
  // encodes this, but fall back the same way if a lookup ever misses.
  return equipmentStatuses.get(equipmentId) ?? 'Stopped'
}

// Equipment eligible as the *primary* unit for a given action.
export function filterEquipmentForAction(equipmentList, equipmentStatuses, action) {
  const required = REQUIRED_STATUS_BY_ACTION[action]
  if (!required) return equipmentList
  return equipmentList.filter((eq) => getStatus(equipmentStatuses, eq.id) === required)
}

// Equipment eligible as the *secondary* unit for a Swap, excluding
// whichever equipment is currently selected as primary (status filtering
// alone already guarantees no overlap — Running vs Stopped are disjoint —
// but excluding the exact id too is cheap insurance against a stale status
// snapshot letting the same unit appear on both sides).
export function filterEquipmentForSecondary(equipmentList, equipmentStatuses, primaryEquipmentId) {
  return equipmentList.filter(
    (eq) =>
      eq.id !== primaryEquipmentId &&
      getStatus(equipmentStatuses, eq.id) === SECONDARY_REQUIRED_STATUS
  )
}

// Re-validates against a freshly-fetched status snapshot right before
// submit, closing most of the race window between "the dropdown was
// populated" and "the insert actually happens" (two people acting on the
// same equipment near-simultaneously). Returns an error message, or null
// if valid. This is app-layer validation, not a DB constraint — see
// SPEC.md "Business rules enforced at the DB layer" for why, and revisit
// if it ever proves insufficient.
export function validateOperationEvent({ action, primaryStatus, secondaryStatus }) {
  const requiredPrimary = REQUIRED_STATUS_BY_ACTION[action]
  if (requiredPrimary && primaryStatus !== requiredPrimary) {
    return requiredPrimary === 'Stopped'
      ? `This equipment is already Running — ${action} requires it to be Stopped.`
      : `This equipment is already Stopped — ${action} requires it to be Running.`
  }

  if (action === 'Swap' && secondaryStatus !== SECONDARY_REQUIRED_STATUS) {
    return 'Secondary equipment must be Stopped for a Swap.'
  }

  return null
}
