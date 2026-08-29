import { fetchSystemsWithEquipment } from '../data/systemsEquipment.js'
import {
  fetchMaintenanceRecords,
  softDeleteMaintenanceRecord,
  restoreMaintenanceRecord,
  hardDeleteMaintenanceRecord,
} from '../data/maintenanceRecords.js'
import { fetchEquipmentStatuses, fetchOperationEvents } from '../data/operationEvents.js'
import { fetchOwnProfile, fetchProfileNames } from '../data/profiles.js'
import { getDefaultRange } from '../lib/dateRange.js'
import { escapeHTML } from '../lib/html.js'
import { openMaintenanceRecordModal } from './recordModal.js'
import { openNewRecordModal } from './newRecordModal.js'
import { openViewRecordModal } from './viewRecordModal.js'
import { openHistoryModal } from './historyModal.js'
import { openManageUsersModal } from './manageUsersModal.js'
import { openChangePasswordModal } from './changePasswordModal.js'
import { renderSystemsHTML } from './recordsTable.js'

// Phase 2 (Maintenance CRUD) + Phase 3 (operation tracking) + Phase 5
// (.docx export) slice (see PLAN.md).
export async function renderMainView(container, { session, onSignOut }) {
  const range = getDefaultRange()

  // Loaded data the delegated click handler below needs access to —
  // refreshed on every reload() call so handlers always see current state.
  const state = {
    systems: [],
    records: [],
    profile: null,
    equipmentStatuses: new Map(),
    profileNames: new Map(),
  }

  container.innerHTML = `
    <header class="app-header">
      <h1>Handover</h1>
      <div class="app-header__user">
        <span id="current-user">${escapeHTML(session.user.email)}</span>
        <button id="manage-users" type="button" hidden>Manage Users</button>
        <button id="change-password" type="button">Change Password</button>
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
      <button id="export-docx" type="button">Export</button>
    </div>
    <div id="records-container" class="records-container">
      <p class="loading">Loading…</p>
    </div>
  `

  container.querySelector('#sign-out').addEventListener('click', onSignOut)

  container.querySelector('#manage-users').addEventListener('click', () => {
    openManageUsersModal({ currentUserId: session.user.id })
  })

  container.querySelector('#change-password').addEventListener('click', () => {
    openChangePasswordModal({ email: session.user.email })
  })

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
    openNewRecordModal({
      systems: state.systems,
      equipmentStatuses: state.equipmentStatuses,
      onSaved: reload,
    })
  })

  container.querySelector('#export-docx').addEventListener('click', handleExport)

  async function handleExport() {
    const button = container.querySelector('#export-docx')
    button.disabled = true
    try {
      // Lazy-loaded: the docx library is large (~350KB) and only needed
      // once someone actually clicks Export, so this keeps it out of the
      // main bundle every other page load pays for.
      const [{ exportRangeToDocx, downloadBlob }, records, operationEvents] = await Promise.all([
        import('../lib/docxExport.js'),
        fetchMaintenanceRecords({ ...currentRange, includeDeleted: false }),
        fetchOperationEvents({ ...currentRange, includeDeleted: false }),
      ])
      const blob = await exportRangeToDocx({
        systems: state.systems,
        records,
        operationEvents,
        equipmentStatuses: state.equipmentStatuses,
        range: currentRange,
      })
      downloadBlob(blob, `Handover_${currentRange.from}_to_${currentRange.to}.docx`)
    } catch (err) {
      window.alert(err.message || 'Failed to generate export.')
    } finally {
      button.disabled = false
    }
  }

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

    // Any other click within the container closes an open menu — this must
    // run before the `!button` early-return below, otherwise a click on a
    // non-button part of the table (a cell, the equipment name, empty row
    // space) leaves the menu open since neither this handler nor the
    // document-level "outside click" one below would ever touch it.
    closeAllMenus()

    const button = event.target.closest('button[data-action]')
    if (!button) return

    if (button.dataset.action === 'history') {
      const equipment = state.systems
        .flatMap((s) => s.equipment)
        .find((e) => e.id === button.dataset.equipmentId)
      if (!equipment) return
      openHistoryModal({
        equipment,
        systems: state.systems,
        equipmentStatuses: state.equipmentStatuses,
        profileNames: state.profileNames,
        userId: session.user.id,
        isAdmin: state.profile?.role === 'admin',
        onChanged: reload,
      })
      return
    }

    const record = state.records.find((r) => r.id === button.dataset.recordId)
    if (!record) return

    if (button.dataset.action === 'view') {
      openViewRecordModal(record, {
        systemName: state.systems.find((s) => s.id === record.system_id)?.name ?? '—',
        equipmentName:
          state.systems
            .flatMap((s) => s.equipment)
            .find((e) => e.id === record.equipment_id)?.name ?? '—',
        createdByName: state.profileNames.get(record.created_by),
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
    } else if (button.dataset.action === 'hard-delete') {
      handleHardDelete(record)
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

  async function handleHardDelete(record) {
    if (
      !window.confirm(
        `Permanently delete the "${record.work_scope}" record? This cannot be undone — there is no restore after this.`
      )
    ) {
      return
    }
    try {
      await hardDeleteMaintenanceRecord(record.id)
      reload()
    } catch (err) {
      window.alert(err.message || 'Failed to permanently delete record.')
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

      const [systems, records, equipmentStatuses, profileNames] = await Promise.all([
        fetchSystemsWithEquipment(),
        fetchMaintenanceRecords({ ...currentRange, includeDeleted: isAdmin && includeDeleted }),
        fetchEquipmentStatuses(),
        fetchProfileNames(),
      ])
      state.systems = systems
      state.records = records
      state.profile = profile
      state.equipmentStatuses = equipmentStatuses
      state.profileNames = profileNames

      const currentUserEl = container.querySelector('#current-user')
      if (currentUserEl) {
        currentUserEl.textContent = `${profile.username}${isAdmin ? ' (admin)' : ''}`
      }

      container.querySelector('#show-deleted-wrap').hidden = !isAdmin
      container.querySelector('#manage-users').hidden = !isAdmin

      recordsContainer.innerHTML = renderSystemsHTML(
        systems,
        records,
        { userId: session.user.id, isAdmin },
        equipmentStatuses
      )
    } catch (err) {
      recordsContainer.innerHTML = `<p class="error">Failed to load records: ${escapeHTML(
        err.message || String(err)
      )}</p>`
    }
  }

  await reload()
}
