import { fetchEquipmentHistory, softDeleteOperationEvent } from '../data/operationEvents.js'
import { escapeHTML } from '../lib/html.js'
import { ICONS } from '../lib/icons.js'
import { openModal } from '../lib/modal.js'
import { openOperationEventModal } from './operationEventModal.js'

// "All operation events for that unit" (SPEC.md) — full history, not
// limited to the main view's date filter. Edit/Delete per event,
// permission-gated the same way as the maintenance records table (own
// event, or admin).
export async function openHistoryModal({ equipment, systems, equipmentStatuses, userId, isAdmin, onChanged }) {
  const allEquipment = systems.flatMap((s) => s.equipment)
  const nameOf = (id) => allEquipment.find((e) => e.id === id)?.name ?? '—'

  const { modalEl, close } = openModal(
    `
    <h2>History — ${escapeHTML(equipment.name)}</h2>
    <div id="history-content"><p class="loading">Loading…</p></div>
    <div class="modal-actions">
      <button type="button" id="history-close">Close</button>
    </div>
  `,
    { wide: true }
  )

  modalEl.querySelector('#history-close').addEventListener('click', close)

  const content = modalEl.querySelector('#history-content')

  // Populated by load(), read by the single delegated click listener below
  // — kept as shared state rather than a listener closure argument so
  // load() can be called repeatedly (after edit/delete) without ever
  // re-attaching a second listener onto the same persistent `content` node.
  let currentEvents = []

  function renderEventsTable(events) {
    if (events.length === 0) {
      return '<p class="empty">No operation events recorded for this unit yet.</p>'
    }

    const rows = events
      .map((event) => {
        const isSecondarySide = event.secondary_equipment_id === equipment.id
        const actionLabel = isSecondarySide
          ? `Swap ← ${escapeHTML(nameOf(event.equipment_id))}`
          : event.action === 'Swap'
            ? `Swap → ${escapeHTML(nameOf(event.secondary_equipment_id))}`
            : escapeHTML(event.action)

        const canEdit = isAdmin || event.created_by === userId
        const disabledAttrs = canEdit
          ? ''
          : 'disabled title="Only the creator or an admin can edit/delete this"'

        const when = new Date(event.event_timestamp).toLocaleString()

        return `
          <tr>
            <td>${escapeHTML(when)}</td>
            <td>${actionLabel}</td>
            <td>${escapeHTML(event.comment ?? '')}</td>
            <td class="actions">
              <div class="row-menu">
                <button type="button" class="row-menu__trigger" data-action="toggle-menu"
                        data-event-id="${event.id}" aria-label="Actions" aria-haspopup="true">⋮</button>
                <div class="row-menu__dropdown" hidden>
                  <button data-action="edit" data-event-id="${event.id}" ${disabledAttrs}>${ICONS.edit} Edit</button>
                  <button data-action="delete" data-event-id="${event.id}" ${disabledAttrs}>${ICONS.delete} Delete</button>
                </div>
              </div>
            </td>
          </tr>
        `
      })
      .join('')

    return `
      <table class="records-table">
        <colgroup>
          <col class="col-history-timestamp" />
          <col class="col-history-action" />
          <col class="col-history-comment" />
          <col class="col-history-actions" />
        </colgroup>
        <thead>
          <tr><th>Timestamp</th><th>Action</th><th>Comment</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `
  }

  async function load() {
    content.innerHTML = '<p class="loading">Loading…</p>'
    try {
      currentEvents = await fetchEquipmentHistory(equipment.id)
      content.innerHTML = renderEventsTable(currentEvents)
    } catch (err) {
      currentEvents = []
      content.innerHTML = `<p class="error">Failed to load history: ${escapeHTML(
        err.message || String(err)
      )}</p>`
    }
  }

  function closeAllMenus() {
    content.querySelectorAll('.row-menu__dropdown').forEach((el) => {
      el.hidden = true
    })
  }

  // Attached once — content's innerHTML gets replaced wholesale on every
  // load(), but content itself (and this listener) persists for the life
  // of the modal.
  content.addEventListener('click', async (clickEvent) => {
    const trigger = clickEvent.target.closest('button[data-action="toggle-menu"]')
    if (trigger) {
      const dropdown = trigger.nextElementSibling
      const wasOpen = !dropdown.hidden
      closeAllMenus()
      dropdown.hidden = wasOpen
      return
    }

    const button = clickEvent.target.closest('button[data-action]')
    if (!button) return
    closeAllMenus()

    const record = currentEvents.find((e) => e.id === button.dataset.eventId)
    if (!record) return

    if (button.dataset.action === 'edit') {
      openOperationEventModal({
        mode: 'edit',
        record,
        systems,
        equipmentStatuses,
        onSaved: () => {
          load()
          onChanged?.()
        },
      })
    } else if (button.dataset.action === 'delete') {
      if (!window.confirm('Delete this operation event? This can be undone by an admin only.')) return
      try {
        await softDeleteOperationEvent(record.id)
        load()
        onChanged?.()
      } catch (err) {
        window.alert(err.message || 'Failed to delete event.')
      }
    }
  })

  await load()
}
