// Pure logic: merges one equipment's maintenance records and operation
// events into a single chronologically-sorted list. Used by the main
// view's per-equipment table (Phase 4) — and written to be reused as-is by
// Phase 5's .docx export, which needs the identical "combined chronological
// table... Swap events appear under both equipment involved" structure
// (SPEC.md).
//
// Maintenance records are date-only (no time-of-day) — treated as
// midnight local time for sorting purposes so they interleave sensibly
// with operation events' precise timestamps on the same day. There's no
// "correct" answer for same-day ordering between a dateless permit record
// and a timed event; midnight is just a consistent, arbitrary choice.
export function buildEquipmentTimeline(equipmentId, maintenanceRecords, operationEvents) {
  const items = []

  for (const record of maintenanceRecords) {
    if (record.equipment_id !== equipmentId) continue
    items.push({ type: 'maintenance', date: new Date(`${record.start_date}T00:00:00`), record })
  }

  for (const event of operationEvents) {
    // A Swap's secondary equipment is a full participant, not a footnote —
    // it shows up on both units' timelines, matching the export spec.
    if (event.equipment_id !== equipmentId && event.secondary_equipment_id !== equipmentId) continue
    items.push({ type: 'operation', date: new Date(event.event_timestamp), record: event })
  }

  items.sort((a, b) => b.date - a.date) // most recent first, matching the existing convention

  return items
}
