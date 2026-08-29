// Pure rendering: data + permissions in, an HTML string out. No DOM
// queries, no event listeners, no fetching — mainView.js owns all of that
// and just calls renderSystemsHTML() to get the markup for its records
// container. Split out because mainView.js was doing both jobs at once and
// had grown past the point that was easy to scan.
import { escapeHTML } from '../lib/html.js'
import { ICONS } from '../lib/icons.js'

export function renderSystemsHTML(systems, records, permissions) {
  const sections = systems
    .map((system) => renderSystemSection(system, records, permissions))
    .filter(Boolean)

  if (sections.length === 0) {
    return '<p class="empty">No maintenance records in this date range.</p>'
  }
  return sections.join('\n')
}

function renderSystemSection(system, records, permissions) {
  const systemRecords = records.filter((r) => r.system_id === system.id)

  let equipmentList = system.equipment
  if (system.hide_when_empty) {
    // Workshop / Others / Scarab GTG: hide any equipment (and the whole
    // system, if that empties the list) with zero records in range.
    equipmentList = equipmentList.filter((eq) =>
      systemRecords.some((r) => r.equipment_id === eq.id)
    )
    if (equipmentList.length === 0) return null
  }

  const equipmentSections = equipmentList
    .map((eq) => renderEquipmentSection(eq, systemRecords, permissions))
    .join('\n')

  return `
    <section class="system-section">
      <h2 class="system-banner">${escapeHTML(system.name)}</h2>
      ${equipmentSections}
    </section>
  `
}

function renderEquipmentSection(equipment, systemRecords, permissions) {
  const records = systemRecords
    .filter((r) => r.equipment_id === equipment.id)
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))

  const rows = records.length
    ? records.map((r) => renderRecordRow(r, permissions)).join('\n')
    : '<tr><td colspan="4" class="no-records">No records in range</td></tr>'

  return `
    <div class="equipment-block">
      <h3 class="equipment-header">${escapeHTML(equipment.name)}</h3>
      <table class="records-table">
        <colgroup>
          <col class="col-start-date" />
          <col class="col-scope" />
          <col class="col-status" />
          <col class="col-actions" />
        </colgroup>
        <thead>
          <tr><th>Start date</th><th>Scope</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

function renderRecordRow(record, permissions) {
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
      return `<button data-action="${item.action}" data-record-id="${record.id}" ${attrs}>${item.icon} ${item.label}</button>`
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
