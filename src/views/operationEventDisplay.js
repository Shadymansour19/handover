// Shared rendering helpers for a single operation event, used by both
// operationEventsTable.js (the main view's Operations toggle) and
// mainView.js's own click handler for it. Split out of historyModal.js
// when the History modal itself was removed (SPEC.md "remove the History
// button — operations view now covers it") — these three were already
// written to be reusable (not left as that modal's own closures), so they
// just needed a home that doesn't disappear with it.
import { escapeHTML } from '../lib/html.js'
import { openModal } from '../lib/modal.js'
import { formatDateTimeDMY } from '../lib/dateFormat.js'
import { renderBulletList } from '../lib/bullets.js'

// Short form for a table preview — just names the other equipment
// involved ("Swap - Pump B"), the same either direction. The
// stopped/started distinction is left to operationActionDescription below
// (shown in the View modal, one click away) rather than crowding the
// table row.
export function operationActionLabel(event, equipmentId, nameOf) {
  if (event.action !== 'Swap') return event.action
  const isSecondarySide = event.secondary_equipment_id === equipmentId
  const otherId = isSecondarySide ? event.equipment_id : event.secondary_equipment_id
  return `Swap - ${nameOf(otherId)}`
}

// Full sentence for the View modal (openViewOperationEventModal below) —
// spells out which equipment stopped and which took over, instead of
// leaving the reader to infer direction from an arrow or a dash.
export function operationActionDescription(event, equipmentId, nameOf) {
  if (event.action !== 'Swap') return event.action
  const isSecondarySide = event.secondary_equipment_id === equipmentId
  return isSecondarySide
    ? `This equipment took over; ${nameOf(event.equipment_id)} stopped.`
    : `This equipment stopped; ${nameOf(event.secondary_equipment_id)} took over.`
}

// Read-only — same `.record-details` dt/dl convention as
// viewRecordModal.js. Exists mainly for mobile, where the Operations
// table hides some columns to fit the remaining ones (see records.css);
// this is where those fields are still reachable from.
export function openViewOperationEventModal({ event, actionLabel, createdByName }) {
  const { modalEl, close } = openModal(`
    <h2>Operation Event</h2>
    <dl class="record-details">
      <dt>Timestamp</dt><dd>${escapeHTML(formatDateTimeDMY(event.event_timestamp))}</dd>
      <dt>Action</dt><dd>${actionLabel}</dd>
      <dt>By</dt><dd>${escapeHTML(createdByName)}</dd>
      <dt>Comment</dt><dd>${renderBulletList(event.comment)}</dd>
    </dl>
    <div class="modal-actions">
      <button type="button" id="view-event-close">Close</button>
    </div>
  `)

  modalEl.querySelector('#view-event-close').addEventListener('click', close)
}
