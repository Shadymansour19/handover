// Pure rendering: data + permissions in, an HTML string out. No DOM
// queries, no event listeners, no fetching — mainView.js owns all of that
// and just calls renderSystemsHTML() to get the markup for its records
// container. Split out because mainView.js was doing both jobs at once and
// had grown past the point that was easy to scan.
import { escapeHTML } from '../lib/html.js'
import { ICONS } from '../lib/icons.js'
import { buildEquipmentTimeline } from '../lib/combinedTimeline.js'

export function renderSystemsHTML(systems, records, operationEvents, permissions, equipmentStatuses) {
  // Built once here rather than re-derived per row — resolves a Swap
  // event's *other* equipment by id (e.g. "Swap → GT-1710B").
  const equipmentById = new Map(systems.flatMap((s) => s.equipment).map((eq) => [eq.id, eq]))
  const nameOf = (id) => equipmentById.get(id)?.name ?? '—'

  const sections = systems
    .map((system) =>
      renderSystemSection(system, records, operationEvents, permissions, equipmentStatuses, nameOf)
    )
    .filter(Boolean)

  if (sections.length === 0) {
    return '<p class="empty">No records in this date range.</p>'
  }
  return sections.join('\n')
}

function renderSystemSection(system, records, operationEvents, permissions, equipmentStatuses, nameOf) {
  const systemRecords = records.filter((r) => r.system_id === system.id)

  let equipmentList = system.equipment
  if (system.hide_when_empty) {
    // Workshop / Others / Scarab GTG: hide any equipment (and the whole
    // system, if that empties the list) with zero records in range. Never
    // operation-tracked, so operation events never factor into this check.
    equipmentList = equipmentList.filter((eq) =>
      systemRecords.some((r) => r.equipment_id === eq.id)
    )
    if (equipmentList.length === 0) return null
  }

  // Operation tracking applies only to these systems, and never to their
  // Generic equipment entry (SPEC.md) — checked here once per equipment
  // rather than re-derived in renderEquipmentSection.
  const equipmentSections = equipmentList
    .map((eq) =>
      renderEquipmentSection(
        eq,
        systemRecords,
        operationEvents,
        permissions,
        system.operation_tracked && !eq.is_generic,
        equipmentStatuses,
        nameOf
      )
    )
    .join('\n')

  return `
    <section class="system-section">
      <h2 class="system-banner">${escapeHTML(system.name)}</h2>
      ${equipmentSections}
    </section>
  `
}

function renderEquipmentSection(
  equipment,
  systemRecords,
  operationEvents,
  permissions,
  isTracked,
  equipmentStatuses,
  nameOf
) {
  // operationEvents is passed through un-filtered by system on purpose —
  // buildEquipmentTimeline matches by equipment_id/secondary_equipment_id
  // directly, which also means a Swap's secondary side still shows up here
  // even in the (should-never-happen, but not DB-enforced) case its stored
  // system_id doesn't match this equipment's actual system.
  const timeline = buildEquipmentTimeline(equipment.id, systemRecords, operationEvents)

  const rows = timeline.length
    ? timeline
        .map((item) =>
          item.type === 'maintenance'
            ? renderMaintenanceRow(item.record, permissions)
            : renderOperationEventRow(item.record, permissions, equipment.id, nameOf)
        )
        .join('\n')
    : '<tr><td colspan="4" class="no-records">No records in range</td></tr>'

  const trackingHTML = isTracked
    ? `
        ${equipmentStatuses.get(equipment.id) === 'Running' ? '<span class="running">(Running)</span>' : ''}
        <button type="button" class="history-button" data-action="history" data-equipment-id="${equipment.id}">History</button>
      `
    : ''

  return `
    <div class="equipment-block">
      <h3 class="equipment-header">
        ${escapeHTML(equipment.name)}
        ${trackingHTML}
      </h3>
      <table class="records-table">
        <colgroup>
          <col class="col-date" />
          <col class="col-detail" />
          <col class="col-note" />
          <col class="col-actions" />
        </colgroup>
        <thead>
          <tr><th>Date</th><th>Scope / Action</th><th>Status / Comment</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

function renderMaintenanceRow(record, permissions) {
  const status =
    record.work_status === 'Other' && record.work_status_other
      ? record.work_status_other
      : record.work_status

  const isDeleted = Boolean(record.deleted_at)
  const canEdit = permissions.isAdmin || record.created_by === permissions.userId

  // Deleted records only ever reach here for an admin (RLS hides them from
  // everyone else) — but permissions.isAdmin is still checked explicitly
  // rather than assumed, matching how every other action here is gated.
  const menuItems = isDeleted
    ? [
        { action: 'view', icon: ICONS.view, label: 'View' },
        permissions.isAdmin
          ? { action: 'restore', icon: ICONS.restore, label: 'Restore' }
          : null,
        permissions.isAdmin
          ? { action: 'hard-delete', icon: ICONS.delete, label: 'Delete forever' }
          : null,
      ].filter(Boolean)
    : [
        { action: 'view', icon: ICONS.view, label: 'View' },
        {
          action: 'edit',
          icon: ICONS.edit,
          label: 'Edit',
          disabled: !canEdit,
          reason: 'Only the creator or an admin can edit this',
        },
        {
          action: 'delete',
          icon: ICONS.delete,
          label: 'Delete',
          disabled: !canEdit,
          reason: 'Only the creator or an admin can delete this',
        },
      ]

  const menuHTML = menuItems
    .map((item) => {
      const attrs = item.disabled ? `disabled title="${escapeHTML(item.reason)}"` : ''
      return `<button data-action="${item.action}" data-record-type="maintenance" data-record-id="${record.id}" ${attrs}>${item.icon} ${item.label}</button>`
    })
    .join('')

  return `
    <tr class="${isDeleted ? 'row-deleted' : ''}">
      <td>${escapeHTML(record.start_date)}</td>
      <td>${escapeHTML(record.work_scope)}${isDeleted ? ' <span class="deleted-tag">(Deleted)</span>' : ''}</td>
      <td>${escapeHTML(status)}</td>
      <td class="actions">
        <div class="row-menu">
          <button type="button" class="row-menu__trigger" data-action="toggle-menu"
                  data-record-id="${record.id}" aria-label="Actions" aria-haspopup="true">⋮</button>
          <div class="row-menu__dropdown" hidden>${menuHTML}</div>
        </div>
      </td>
    </tr>
  `
}

function renderOperationEventRow(event, permissions, equipmentId, nameOf) {
  const isSecondarySide = event.secondary_equipment_id === equipmentId
  const actionLabel = isSecondarySide
    ? `Swap ← ${escapeHTML(nameOf(event.equipment_id))}`
    : event.action === 'Swap'
      ? `Swap → ${escapeHTML(nameOf(event.secondary_equipment_id))}`
      : escapeHTML(event.action)

  const isDeleted = Boolean(event.deleted_at)
  const canEdit = permissions.isAdmin || event.created_by === permissions.userId

  const menuItems = isDeleted
    ? [
        permissions.isAdmin
          ? { action: 'restore', icon: ICONS.restore, label: 'Restore' }
          : null,
        permissions.isAdmin
          ? { action: 'hard-delete', icon: ICONS.delete, label: 'Delete forever' }
          : null,
      ].filter(Boolean)
    : [
        {
          action: 'edit',
          icon: ICONS.edit,
          label: 'Edit',
          disabled: !canEdit,
          reason: 'Only the creator or an admin can edit this',
        },
        {
          action: 'delete',
          icon: ICONS.delete,
          label: 'Delete',
          disabled: !canEdit,
          reason: 'Only the creator or an admin can delete this',
        },
      ]

  const menuHTML = menuItems
    .map((item) => {
      const attrs = item.disabled ? `disabled title="${escapeHTML(item.reason)}"` : ''
      return `<button data-action="${item.action}" data-record-type="operation" data-record-id="${event.id}" ${attrs}>${item.icon} ${item.label}</button>`
    })
    .join('')

  const when = new Date(event.event_timestamp).toLocaleString()

  return `
    <tr class="row-operation ${isDeleted ? 'row-deleted' : ''}">
      <td>${escapeHTML(when)}</td>
      <td>⚙ ${actionLabel}${isDeleted ? ' <span class="deleted-tag">(Deleted)</span>' : ''}</td>
      <td>${escapeHTML(event.comment ?? '')}</td>
      <td class="actions">
        <div class="row-menu">
          <button type="button" class="row-menu__trigger" data-action="toggle-menu"
                  data-record-id="${event.id}" aria-label="Actions" aria-haspopup="true">⋮</button>
          <div class="row-menu__dropdown" hidden>${menuHTML}</div>
        </div>
      </td>
    </tr>
  `
}
