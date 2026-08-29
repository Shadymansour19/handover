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
import { openFilterModal } from './filterModal.js'
import { renderSystemsHTML } from './recordsTable.js'
import { ICONS } from '../lib/icons.js'
import { downloadBlob } from '../lib/downloadBlob.js'

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
        <div class="row-menu">
          <button id="user-menu-trigger" type="button" class="row-menu__trigger"
                  aria-label="Menu" aria-haspopup="true" aria-expanded="false" title="Menu">${ICONS.menu}</button>
          <div id="user-menu-dropdown" class="row-menu__dropdown" hidden>
            <button id="manage-users" type="button" hidden>${ICONS.users} Manage Users</button>
            <button id="change-password" type="button">${ICONS.lock} Change Password</button>
            <button id="sign-out" type="button">${ICONS.signout} Sign out</button>
          </div>
        </div>
      </div>
    </header>
    <div id="records-container" class="records-container">
      <p class="loading">Loading…</p>
    </div>
    <div class="fab-cluster" id="fab-cluster">
      <button type="button" class="fab fab--main" id="fab-toggle"
              title="Actions" aria-label="Actions" aria-haspopup="true" aria-expanded="false">${ICONS.dots}</button>
      <div class="fab-actions" id="fab-actions" hidden>
        <button type="button" class="fab fab--sub" id="fab-export-pdf" title="Export PDF" aria-label="Export PDF">${ICONS.pdf}</button>
        <button type="button" class="fab fab--sub" id="fab-export" title="Export Word" aria-label="Export Word">${ICONS.export}</button>
        <button type="button" class="fab fab--sub" id="fab-filter" title="Filter records" aria-label="Filter records">${ICONS.filter}</button>
        <button type="button" class="fab fab--sub" id="fab-new-record" title="Add record" aria-label="Add record">${ICONS.plus}</button>
      </div>
    </div>
  `

  container.querySelector('#sign-out').addEventListener('click', onSignOut)

  container.querySelector('#manage-users').addEventListener('click', () => {
    openManageUsersModal({ currentUserId: session.user.id })
  })

  container.querySelector('#change-password').addEventListener('click', () => {
    openChangePasswordModal({ email: session.user.email })
  })

  // Drives both the header's hamburger dropdown and the FAB cluster's
  // expand/collapse: click the trigger to toggle, click any button inside
  // the dropdown to close it again, click anywhere else outside it to close
  // it too. mainView.js only renders once per signed-in session (not
  // repeatedly opened/closed like a modal), so — same as the row-menu
  // dropdowns' own document-level listener further below — registering one
  // document click listener per toggle here doesn't leak.
  function setupToggle(trigger, dropdown) {
    trigger.addEventListener('click', (event) => {
      event.stopPropagation()
      const willOpen = dropdown.hidden
      dropdown.hidden = !willOpen
      trigger.setAttribute('aria-expanded', String(willOpen))
    })
    dropdown.addEventListener('click', (event) => {
      if (event.target.closest('button')) {
        dropdown.hidden = true
        trigger.setAttribute('aria-expanded', 'false')
      }
    })
    document.addEventListener('click', (event) => {
      if (!dropdown.hidden && !dropdown.contains(event.target) && event.target !== trigger) {
        dropdown.hidden = true
        trigger.setAttribute('aria-expanded', 'false')
      }
    })
  }

  setupToggle(container.querySelector('#user-menu-trigger'), container.querySelector('#user-menu-dropdown'))
  setupToggle(container.querySelector('#fab-toggle'), container.querySelector('#fab-actions'))

  let currentRange = range
  let includeDeleted = false

  container.querySelector('#fab-new-record').addEventListener('click', () => {
    openNewRecordModal({
      systems: state.systems,
      equipmentStatuses: state.equipmentStatuses,
      onSaved: reload,
    })
  })

  container.querySelector('#fab-filter').addEventListener('click', () => {
    openFilterModal({
      from: currentRange.from,
      to: currentRange.to,
      includeDeleted,
      isAdmin: state.profile?.role === 'admin',
      onApply: (next) => {
        currentRange = { from: next.from, to: next.to }
        includeDeleted = next.includeDeleted
        reload()
      },
    })
  })

  container.querySelector('#fab-export').addEventListener('click', () => handleExport('docx'))
  container.querySelector('#fab-export-pdf').addEventListener('click', () => handleExport('pdf'))

  // Shared by both export formats — always the current filter range's
  // non-deleted data, fetched fresh rather than reused from state.records
  // (which may itself include deleted rows for an admin with "show
  // deleted" on, and never includes operation events at all).
  async function fetchExportData() {
    const [records, operationEvents] = await Promise.all([
      fetchMaintenanceRecords({ ...currentRange, includeDeleted: false }),
      fetchOperationEvents({ ...currentRange, includeDeleted: false }),
    ])
    return { records, operationEvents }
  }

  async function handleExport(format) {
    const button = container.querySelector(format === 'pdf' ? '#fab-export-pdf' : '#fab-export')
    button.disabled = true
    try {
      const exporterName = state.profileNames.get(session.user.id) ?? session.user.email
      const filenameBase = `Handover_${currentRange.from}_to_${currentRange.to}`

      if (format === 'pdf') {
        // Lazy-loaded: pdfmake (with its bundled font set) is large and
        // only needed once someone actually clicks Export PDF, so this
        // keeps it out of the main bundle every other page load pays for
        // — same reasoning as docx below, kept as two independent chunks
        // rather than one "exports" bundle so picking one format doesn't
        // pull in the other's library too.
        const [{ exportRangeToPdf }, { records, operationEvents }] = await Promise.all([
          import('../lib/pdfExport.js'),
          fetchExportData(),
        ])
        const blob = await exportRangeToPdf({
          systems: state.systems,
          records,
          operationEvents,
          equipmentStatuses: state.equipmentStatuses,
          range: currentRange,
          exporterName,
        })
        downloadBlob(blob, `${filenameBase}.pdf`)
      } else {
        // Lazy-loaded: the docx library is large (~350KB) and only needed
        // once someone actually clicks Export, so this keeps it out of the
        // main bundle every other page load pays for.
        const [{ exportRangeToDocx }, { records, operationEvents }] = await Promise.all([
          import('../lib/docxExport.js'),
          fetchExportData(),
        ])
        const blob = await exportRangeToDocx({
          systems: state.systems,
          records,
          operationEvents,
          equipmentStatuses: state.equipmentStatuses,
          range: currentRange,
          exporterName,
        })
        downloadBlob(blob, `${filenameBase}.docx`)
      }
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
