import { fetchSystemsWithEquipment } from '../data/systemsEquipment.js'
import {
  fetchMaintenanceRecords,
  softDeleteMaintenanceRecord,
  restoreMaintenanceRecord,
} from '../data/maintenanceRecords.js'
import { fetchOwnProfile } from '../data/profiles.js'
import { getDefaultRange } from '../lib/dateRange.js'
import { escapeHTML } from '../lib/html.js'
import { ICONS } from '../lib/icons.js'
import { openMaintenanceRecordModal } from './recordModal.js'
import { openViewRecordModal } from './viewRecordModal.js'

// Phase 2 slice: Maintenance CRUD (create/edit/soft-delete + read-only
// View). Operation tracking and export land in Phase 3+ (see PLAN.md).
export async function renderMainView(container, { session, onSignOut }) {
  const range = getDefaultRange()

  // Loaded data the delegated click handler below needs access to —
  // refreshed on every reload() call so handlers always see current state.
  const state = { systems: [], records: [], profile: null }

  container.innerHTML = `
    <header class="app-header">
      <h1>Handover</h1>
      <div class="app-header__user">
        <span id="current-user">${escapeHTML(session.user.email)}</span>
        <button id="sign-out" type="button">Sign out</button>
      </div>
    </header>
    <div class="toolbar">
      <form id="date-filter" class="date-filter">
        <label>From <input type="date" id="filter-from" value="${range.from}" /></label>
        <label>To <input type="date" id="filter-to" value="${range.to}" /></label>
        <button type="submit">Apply</button>
        <label id="show-deleted-wrap" class="checkbox-label" hidden>
          <input type="checkbox" id="show-deleted" /> Show deleted
        </label>
      </form>
      <button id="new-record" type="button">+ New Record</button>
    </div>
    <div id="records-container" class="records-container">
      <p class="loading">Loading…</p>
    </div>
  `

  container.querySelector('#sign-out').addEventListener('click', onSignOut)

  let currentRange = range
  let includeDeleted = false
  const form = container.querySelector('#date-filter')
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    currentRange = {
      from: container.querySelector('#filter-from').value,
      to: container.querySelector('#filter-to').value,
    }
    reload()
  })

  container.querySelector('#show-deleted').addEventListener('change', (event) => {
    includeDeleted = event.target.checked
    reload()
  })

  container.querySelector('#new-record').addEventListener('click', () => {
    openMaintenanceRecordModal({
      mode: 'create',
      systems: state.systems,
      onSaved: reload,
    })
  })

  // Event delegation: rows are re-rendered wholesale on every reload, so one
  // listener on the container outlives any individual row's buttons.
  const recordsContainer = container.querySelector('#records-container')

  function closeAllMenus() {
    recordsContainer.querySelectorAll('.row-menu__dropdown').forEach((el) => {
      el.hidden = true
    })
  }

  // Click anywhere outside an open menu closes it. Fires after the
  // container's own listener below (event bubbles up), so a click that
  // just opened a menu doesn't immediately close it again.
  document.addEventListener('click', (event) => {
    if (!recordsContainer.contains(event.target)) closeAllMenus()
  })

  recordsContainer.addEventListener('click', (event) => {
    const trigger = event.target.closest('button[data-action="toggle-menu"]')
    if (trigger) {
      const dropdown = trigger.nextElementSibling
      const wasOpen = !dropdown.hidden
      closeAllMenus()
      dropdown.hidden = wasOpen
      return
    }

    const button = event.target.closest('button[data-action]')
    if (!button) return
    closeAllMenus()

    const record = state.records.find((r) => r.id === button.dataset.recordId)
    if (!record) return

    if (button.dataset.action === 'view') {
      openViewRecordModal(record, {
        systemName: state.systems.find((s) => s.id === record.system_id)?.name ?? '—',
        equipmentName:
          state.systems
            .flatMap((s) => s.equipment)
            .find((e) => e.id === record.equipment_id)?.name ?? '—',
      })
    } else if (button.dataset.action === 'edit') {
      openMaintenanceRecordModal({
        mode: 'edit',
        record,
        systems: state.systems,
        onSaved: reload,
      })
    } else if (button.dataset.action === 'delete') {
      handleDelete(record)
    } else if (button.dataset.action === 'restore') {
      handleRestore(record)
    }
  })

  async function handleRestore(record) {
    if (!window.confirm(`Restore the "${record.work_scope}" record?`)) return
    try {
      await restoreMaintenanceRecord(record.id)
      reload()
    } catch (err) {
      window.alert(err.message || 'Failed to restore record.')
    }
  }

  async function handleDelete(record) {
    if (!window.confirm(`Delete the "${record.work_scope}" record? This can be undone by an admin only.`)) {
      return
    }
    try {
      await softDeleteMaintenanceRecord(record.id)
      reload()
    } catch (err) {
      window.alert(err.message || 'Failed to delete record.')
    }
  }

  async function reload() {
    recordsContainer.innerHTML = '<p class="loading">Loading…</p>'
    try {
      const profile = state.profile ?? (await fetchOwnProfile(session.user.id))
      const isAdmin = profile.role === 'admin'

      const [systems, records] = await Promise.all([
        fetchSystemsWithEquipment(),
        fetchMaintenanceRecords({ ...currentRange, includeDeleted: isAdmin && includeDeleted }),
      ])
      state.systems = systems
      state.records = records
      state.profile = profile

      const currentUserEl = container.querySelector('#current-user')
      if (currentUserEl) {
        currentUserEl.textContent = `${profile.username}${isAdmin ? ' (admin)' : ''}`
      }

      container.querySelector('#show-deleted-wrap').hidden = !isAdmin

      recordsContainer.innerHTML = renderSystemsHTML(systems, records, {
        userId: session.user.id,
        isAdmin,
      })
    } catch (err) {
      recordsContainer.innerHTML = `<p class="error">Failed to load records: ${escapeHTML(
        err.message || String(err)
      )}</p>`
    }
  }

  await reload()
}

function renderSystemsHTML(systems, records, permissions) {
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
