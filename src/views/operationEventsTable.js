// Pure rendering: data + permissions in, an HTML string out — same split
// as recordsTable.js, which this mirrors. Added for the main view's
// Maintenance/Operations toggle (SPEC.md "maintenance/operations toggle
// view") — previously operation events were only ever visible through the
// per-equipment History modal; this is the same event data, just grouped
// by System/Equipment the same way the maintenance table is, instead of
// scoped to one unit's full history.
import { escapeHTML } from '../lib/html.js'
import { ICONS } from '../lib/icons.js'
import { formatDateTimeDMY } from '../lib/dateFormat.js'
// Same short label historyModal.js's own table preview uses — reused
// directly rather than duplicated, since this is the identical
// table-preview context (unlike docxExport.js/pdfExport.js, which have
// their own copies because a printed document has genuinely different
// formatting needs — see SPEC.md "Swap direction in History/exports").
import { operationActionLabel } from './historyModal.js'

export function renderOperationSystemsHTML(systems, operationEvents, permissions, equipmentStatuses, profileNames) {
  const allEquipment = systems.flatMap((s) => s.equipment)
  const nameOf = (id) => allEquipment.find((e) => e.id === id)?.name ?? '—'

  // Operation tracking only ever applies to these systems (and never to
  // their Generic equipment) — see equipmentStatus.js/SPEC.md. A system
  // with no tracked equipment has nothing to show here at all.
  const sections = systems
    .filter((system) => system.operation_tracked)
    .map((system) => renderSystemSection(system, operationEvents, permissions, equipmentStatuses, nameOf, profileNames))
    .filter(Boolean)

  if (sections.length === 0) {
    return '<p class="empty">No operation events in this date range.</p>'
  }
  return sections.join('\n')
}

function renderSystemSection(system, operationEvents, permissions, equipmentStatuses, nameOf, profileNames) {
  const equipmentList = system.equipment.filter((eq) => !eq.is_generic)
  if (equipmentList.length === 0) return null

  const equipmentSections = equipmentList
    .map((eq) => renderEquipmentSection(eq, operationEvents, permissions, equipmentStatuses, nameOf, profileNames))
    .join('\n')

  return `
    <section class="system-section">
      <h2 class="system-banner">${escapeHTML(system.name)}</h2>
      ${equipmentSections}
    </section>
  `
}

function renderEquipmentSection(equipment, operationEvents, permissions, equipmentStatuses, nameOf, profileNames) {
  const events = operationEvents
    .filter((e) => e.equipment_id === equipment.id || e.secondary_equipment_id === equipment.id)
    .sort((a, b) => (a.event_timestamp < b.event_timestamp ? 1 : -1))

  const rows = events.length
    ? events.map((e) => renderEventRow(e, equipment.id, permissions, nameOf, profileNames)).join('\n')
    : '<tr><td colspan="5" class="no-records">No events in range</td></tr>'

  const runningTag = equipmentStatuses.get(equipment.id) === 'Running' ? '<span class="running">(Running)</span>' : ''

  // Same column set as historyModal.js's own table (Timestamp/Action/By/
  // Comment/actions) — SPEC.md "operation view: match History's row
  // layout" — so a record looks identical whether reached from here or
  // from History.
  return `
    <div class="equipment-block">
      <h3 class="equipment-header">
        ${escapeHTML(equipment.name)}
        ${runningTag}
        <button type="button" class="history-button" data-action="history" data-equipment-id="${equipment.id}">History</button>
      </h3>
      <table class="records-table history-table">
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
    </div>
  `
}

function renderEventRow(event, equipmentId, permissions, nameOf, profileNames) {
  const actionLabel = escapeHTML(operationActionLabel(event, equipmentId, nameOf))

  const isDeleted = Boolean(event.deleted_at)
  const isOwnEvent = event.created_by === permissions.userId
  const canEdit = permissions.isAdmin || isOwnEvent || Boolean(permissions.grantedEventIds?.has(event.id))
  const canManageAccess = permissions.isAdmin || isOwnEvent

  // Same shape as historyModal.js's own renderEventsTable — deleted
  // events only ever reach here for an admin (RLS hides them from
  // everyone else).
  const menuItems = isDeleted
    ? [
        { action: 'view', icon: ICONS.view, label: 'View' },
        permissions.isAdmin ? { action: 'restore', icon: ICONS.restore, label: 'Restore' } : null,
        permissions.isAdmin ? { action: 'hard-delete', icon: ICONS.delete, label: 'Delete forever' } : null,
      ].filter(Boolean)
    : [
        { action: 'view', icon: ICONS.view, label: 'View' },
        {
          action: 'edit',
          icon: ICONS.edit,
          label: 'Edit',
          disabled: !canEdit,
          reason: 'Only the creator, an admin, or someone granted access can edit/delete this',
        },
        {
          action: 'delete',
          icon: ICONS.delete,
          label: 'Delete',
          disabled: !canEdit,
          reason: 'Only the creator, an admin, or someone granted access can edit/delete this',
        },
        canManageAccess ? { action: 'manage-access', icon: ICONS.share, label: 'Manage Access' } : null,
      ].filter(Boolean)

  const menuHTML = menuItems
    .map((item) => {
      const attrs = item.disabled ? `disabled title="${escapeHTML(item.reason)}"` : ''
      // data-record-type distinguishes this from a maintenance row's
      // identically-named actions in mainView.js's single delegated click
      // listener — maintenance rows have no such attribute, so the
      // listener's existing behavior for them is completely unaffected.
      return `<button data-action="${item.action}" data-event-id="${event.id}" data-record-type="operation" ${attrs}>${item.icon} ${item.label}</button>`
    })
    .join('')

  const createdByName = profileNames.get(event.created_by) ?? '—'

  return `
    <tr class="${isDeleted ? 'row-deleted' : ''}">
      <td>${escapeHTML(formatDateTimeDMY(event.event_timestamp))}</td>
      <td>${actionLabel}${isDeleted ? ' <span class="deleted-tag">(Deleted)</span>' : ''}</td>
      <td>${escapeHTML(createdByName)}</td>
      <td>${escapeHTML(event.comment ?? '')}</td>
      <td class="actions">
        <div class="row-menu">
          <button type="button" class="row-menu__trigger" data-action="toggle-menu"
                  data-event-id="${event.id}" data-record-type="operation" aria-label="Actions" aria-haspopup="true">⋮</button>
          <div class="row-menu__dropdown" hidden>${menuHTML}</div>
        </div>
      </td>
    </tr>
  `
}
