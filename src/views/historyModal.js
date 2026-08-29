import {
  fetchEquipmentHistory,
  softDeleteOperationEvent,
  restoreOperationEvent,
  hardDeleteOperationEvent,
} from '../data/operationEvents.js'
import { escapeHTML } from '../lib/html.js'
import { ICONS } from '../lib/icons.js'
import { openModal } from '../lib/modal.js'
import { formatDateTimeDMY } from '../lib/dateFormat.js'
import { openOperationEventModal } from './operationEventModal.js'

// "All operation events for that unit" (SPEC.md) — full history, not
// limited to the main view's date filter. Edit/Delete per event,
// permission-gated the same way as the maintenance records table (own
// event, or admin) — including the same admin view/restore/hard-delete of
// soft-deleted events (20260830090000_admin_view_restore_operation_events.sql).
export async function openHistoryModal({
  equipment,
  systems,
  equipmentStatuses,
  profileNames,
  userId,
  isAdmin,
  onChanged,
}) {
  const allEquipment = systems.flatMap((s) => s.equipment)
  const nameOf = (id) => allEquipment.find((e) => e.id === id)?.name ?? '—'

  const { modalEl, close, onClose } = openModal(
    `
    <h2>History — ${escapeHTML(equipment.name)}</h2>
    ${
      isAdmin
        ? `<label class="checkbox-label">
             <input type="checkbox" id="history-show-deleted" /> Show deleted
           </label>`
        : ''
    }
    <div id="history-content"><p class="loading">Loading…</p></div>
    <div class="modal-actions">
      <button type="button" id="history-close">Close</button>
    </div>
  `,
    { wide: true }
  )

  modalEl.querySelector('#history-close').addEventListener('click', close)

  const content = modalEl.querySelector('#history-content')
  let includeDeleted = false

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

        const isDeleted = Boolean(event.deleted_at)
        const canEdit = isAdmin || event.created_by === userId
        const disabledAttrs = canEdit
          ? ''
          : 'disabled title="Only the creator or an admin can edit/delete this"'

        const when = formatDateTimeDMY(event.event_timestamp)

        // Deleted events only ever reach here for an admin (RLS hides them
        // from everyone else) — same shape as the maintenance table's
        // deleted-row menu: no Edit, just Restore/Delete forever.
        const menuItems = isDeleted
          ? [
              isAdmin ? { action: 'restore', icon: ICONS.restore, label: 'Restore' } : null,
              isAdmin
                ? { action: 'hard-delete', icon: ICONS.delete, label: 'Delete forever' }
                : null,
            ].filter(Boolean)
          : [
              { action: 'edit', icon: ICONS.edit, label: 'Edit', attrs: disabledAttrs },
              { action: 'delete', icon: ICONS.delete, label: 'Delete', attrs: disabledAttrs },
            ]

        const menuHTML = menuItems
          .map(
            (item) =>
              `<button data-action="${item.action}" data-event-id="${event.id}" ${item.attrs ?? ''}>${item.icon} ${item.label}</button>`
          )
          .join('')

        const createdByName = profileNames.get(event.created_by) ?? '—'

        return `
          <tr class="${isDeleted ? 'row-deleted' : ''}">
            <td>${escapeHTML(when)}</td>
            <td>${actionLabel}${isDeleted ? ' <span class="deleted-tag">(Deleted)</span>' : ''}</td>
            <td>${escapeHTML(createdByName)}</td>
            <td>${escapeHTML(event.comment ?? '')}</td>
            <td class="actions">
              <div class="row-menu">
                <button type="button" class="row-menu__trigger" data-action="toggle-menu"
                        data-event-id="${event.id}" aria-label="Actions" aria-haspopup="true">⋮</button>
                <div class="row-menu__dropdown" hidden>${menuHTML}</div>
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
          <col class="col-history-by" />
          <col class="col-history-comment" />
          <col class="col-history-actions" />
        </colgroup>
        <thead>
          <tr><th>Timestamp</th><th>Action</th><th>By</th><th>Comment</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `
  }

  async function load() {
    content.innerHTML = '<p class="loading">Loading…</p>'
    try {
      currentEvents = await fetchEquipmentHistory(equipment.id, { includeDeleted })
      content.innerHTML = renderEventsTable(currentEvents)
    } catch (err) {
      currentEvents = []
      content.innerHTML = `<p class="error">Failed to load history: ${escapeHTML(
        err.message || String(err)
      )}</p>`
    }
  }

  const showDeletedCheckbox = modalEl.querySelector('#history-show-deleted')
  showDeletedCheckbox?.addEventListener('change', (event) => {
    includeDeleted = event.target.checked
    load()
  })

  function closeAllMenus() {
    content.querySelectorAll('.row-menu__dropdown').forEach((el) => {
      el.hidden = true
    })
  }

  // Closes an open menu on any click elsewhere in the modal (the title,
  // the "Show deleted" checkbox, etc. — anything outside `content`) or on
  // the page behind it. Registered via onClose() so it's actually removed
  // when the modal closes, however that happens (Close button, Escape, or
  // clicking the overlay) — otherwise every History open would leave
  // another one of these listening on `document` forever.
  function handleOutsideClick(event) {
    if (!content.contains(event.target)) closeAllMenus()
  }
  document.addEventListener('click', handleOutsideClick)
  onClose(() => document.removeEventListener('click', handleOutsideClick))

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

    // Any other click within content closes an open menu — see the
    // matching comment in mainView.js for why this must come before the
    // `!button` early-return below.
    closeAllMenus()

    const button = clickEvent.target.closest('button[data-action]')
    if (!button) return

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
    } else if (button.dataset.action === 'restore') {
      if (!window.confirm('Restore this operation event?')) return
      try {
        await restoreOperationEvent(record.id)
        load()
        onChanged?.()
      } catch (err) {
        window.alert(err.message || 'Failed to restore event.')
      }
    } else if (button.dataset.action === 'hard-delete') {
      if (
        !window.confirm(
          'Permanently delete this operation event? This cannot be undone — there is no restore after this.'
        )
      ) {
        return
      }
      try {
        await hardDeleteOperationEvent(record.id)
        load()
        onChanged?.()
      } catch (err) {
        window.alert(err.message || 'Failed to permanently delete event.')
      }
    }
  })

  await load()
}
