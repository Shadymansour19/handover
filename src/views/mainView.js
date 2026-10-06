import { fetchSystemsWithEquipment } from '../data/systemsEquipment.js'
import {
  fetchMaintenanceRecords,
  softDeleteMaintenanceRecord,
  restoreMaintenanceRecord,
  hardDeleteMaintenanceRecord,
} from '../data/maintenanceRecords.js'
import { fetchEquipmentStatuses, fetchOperationEvents } from '../data/operationEvents.js'
import { fetchOwnProfile, fetchProfileNames, fetchGrantableUsers } from '../data/profiles.js'
import { fetchMyRecordAccessIds } from '../data/recordAccess.js'
import { getDefaultRange } from '../lib/dateRange.js'
import { escapeHTML } from '../lib/html.js'
import { openMaintenanceRecordModal } from './recordModal.js'
import { openNewRecordModal } from './newRecordModal.js'
import { openViewRecordModal } from './viewRecordModal.js'
import { openHistoryModal } from './historyModal.js'
import { openManageUsersModal } from './manageUsersModal.js'
import { openManageRecordAccessModal } from './manageRecordAccessModal.js'
import { openChangePasswordModal } from './changePasswordModal.js'
import { openFilterModal } from './filterModal.js'
import { renderSystemsHTML } from './recordsTable.js'
import { ICONS } from '../lib/icons.js'
import { downloadBlob } from '../lib/downloadBlob.js'
import { subscribeToChanges } from '../lib/realtime.js'
import { positionDropdownToFit } from '../lib/dropdownPosition.js'
import { showUndoToast } from '../lib/undoToast.js'
import { staleDays } from '../lib/staleness.js'
import { openStaleRecordsModal } from './staleRecordsModal.js'

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
    // Which maintenance records the CURRENT user has been granted access
    // to beyond their own — only ever populated for a non-admin session
    // (an admin already has full access to everything, see reload()).
    grantedRecordIds: new Set(),
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
    <div class="fab-cluster" id="fab-cluster">
      <button type="button" class="fab fab--main" id="fab-toggle"
              title="Actions" aria-label="Actions" aria-haspopup="true" aria-expanded="false">${ICONS.dots}</button>
      <div class="fab-actions" id="fab-actions" hidden>
        <button type="button" class="fab fab--sub" id="fab-export-pdf" title="Export PDF (P)" aria-label="Export PDF">${ICONS.pdf}</button>
        <button type="button" class="fab fab--sub" id="fab-export" title="Export Word (W)" aria-label="Export Word">${ICONS.export}</button>
        <button type="button" class="fab fab--sub" id="fab-filter" title="Filter records (F)" aria-label="Filter records">${ICONS.filter}</button>
        <button type="button" class="fab fab--sub" id="fab-new-record" title="Add record (N)" aria-label="Add record">${ICONS.plus}</button>
      </div>
    </div>
    <div id="records-container" class="records-container">
      <p class="loading">Loading…</p>
    </div>
  `

  // Live sync: someone else creating/editing a record or operation event
  // refreshes this view automatically instead of needing a manual reload —
  // see SPEC.md "live sync between users". `reload` is a function
  // declaration further down (hoisted), safe to reference here.
  // main.js MUST call the returned unsubscribe before mounting a fresh
  // view (a real sign-in/out), or this keeps calling reload() against a
  // recordsContainer that's no longer even on the page — the exact same
  // leak class as the stale-UI-after-tab-refocus bug fixed 2026-09-23,
  // just via a different trigger (a DB change instead of a spurious auth
  // event).
  // maintenance_record_access (not operation_event_access too — this view
  // never shows operation events or their edit buttons at all, so a grant
  // change there has no visible effect here; historyModal.js subscribes
  // to that one instead) is what makes a just-granted user's Edit/Delete
  // light up live instead of needing an unrelated change elsewhere to
  // trigger the next reload().
  const unsubscribeFromChanges = subscribeToChanges(
    ['maintenance_records', 'operation_events', 'maintenance_record_access'],
    reload
  )

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
  // Case-insensitive substring match against work_scope/detailed_steps/
  // comment (see fetchMaintenanceRecords) — main-view-only, deliberately
  // not threaded into fetchExportData()'s own fetches below: an export is
  // meant to be the complete official record for the date range, not
  // whatever the admin happened to be searching for on screen at the time.
  let currentSearch = ''
  // Stale-records popup (staleRecordsModal.js) is a one-time-per-session
  // nudge, not something to re-show on every reload() — and reload() now
  // fires constantly (live sync, every own action), not just at mount.
  let staleCheckDone = false

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
      search: currentSearch,
      includeDeleted,
      isAdmin: state.profile?.role === 'admin',
      onApply: (next) => {
        currentRange = { from: next.from, to: next.to }
        currentSearch = next.search
        includeDeleted = next.includeDeleted
        reload()
      },
    })
  })

  container.querySelector('#fab-export').addEventListener('click', () => handleExport('docx'))
  container.querySelector('#fab-export-pdf').addEventListener('click', () => handleExport('pdf'))

  // Single-letter shortcuts for the four actions above — bare keypresses
  // only, so Ctrl/Cmd/Alt combos (e.g. the browser's own Ctrl+F) pass
  // through untouched, and only while focus isn't in a text field and no
  // modal is open (modal.js's overlay is the one place .modal-overlay
  // exists), so typing elsewhere in the app is never hijacked. Hints live
  // in each button's title (set above) rather than a separate help UI.
  const SHORTCUT_KEYS = {
    n: '#fab-new-record',
    f: '#fab-filter',
    w: '#fab-export',
    p: '#fab-export-pdf',
  }

  function isTypingTarget(el) {
    if (!el) return false
    const tag = el.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
  }

  function handleShortcutKeydown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (isTypingTarget(event.target)) return
    if (document.querySelector('.modal-overlay')) return

    const selector = SHORTCUT_KEYS[event.key.toLowerCase()]
    if (!selector) return

    const button = container.querySelector(selector)
    if (!button || button.disabled) return

    event.preventDefault()
    button.click()
  }

  // mainView.js only mounts once per signed-in session, but main.js must
  // still tear this down before a fresh view mounts (a real sign-in/out)
  // — same leak class as the realtime subscription above, just for a
  // document-level listener instead of a Supabase channel. Bundled into
  // the same returned cleanup function below.
  document.addEventListener('keydown', handleShortcutKeydown)

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
      if (!dropdown.hidden) positionDropdownToFit(trigger, dropdown)
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
    } else if (button.dataset.action === 'manage-access') {
      handleManageAccess(record)
    }
  })

  async function handleManageAccess(record) {
    try {
      // Fetched fresh at click time rather than kept in state — infrequent,
      // and avoids every reload() paying for a user list that's irrelevant
      // to most records (only a record's own creator or an admin ever
      // sees this action at all).
      const users = await fetchGrantableUsers()
      openManageRecordAccessModal({
        recordType: 'maintenance',
        recordId: record.id,
        creatorId: record.created_by,
        users,
        onSaved: reload,
      })
    } catch (err) {
      window.alert(err.message || 'Failed to load users.')
    }
  }

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
    if (
      !window.confirm(
        `Delete the "${record.work_scope}" record? You can undo this for a few seconds right after; after that, only an admin can restore it.`
      )
    ) {
      return
    }
    try {
      await softDeleteMaintenanceRecord(record.id)
      reload()

      // Only shown when restoreMaintenanceRecord() will actually succeed
      // for THIS user — an admin, or the record's own creator (who gets a
      // brief self-undo window baked into the RPC itself, see
      // 20261015000000_self_undo_delete.sql). Someone who merely has
      // granted edit access isn't either of those, so they just don't get
      // the toast rather than one that fails if clicked.
      const canUndo = state.profile?.role === 'admin' || record.created_by === session.user.id
      if (canUndo) {
        showUndoToast({
          message: `Deleted "${record.work_scope}".`,
          onUndo: async () => {
            try {
              await restoreMaintenanceRecord(record.id)
              reload()
            } catch (err) {
              window.alert(err.message || 'Failed to undo — ask an admin to restore it.')
            }
          },
        })
      }
    } catch (err) {
      window.alert(err.message || 'Failed to delete record.')
    }
  }

  // Proactively surfaces stale records (lib/staleness.js) to whoever can
  // act on them — admin sees every stale record, a regular user only the
  // ones they could actually edit (their own, or one they've been granted
  // access to). Called once per session by reload() above, not on every
  // refresh.
  function showStaleRecordsIfAny({ systems, records, isAdmin, grantedRecordIds }) {
    const equipmentById = new Map(
      systems.flatMap((s) => s.equipment.map((eq) => [eq.id, { equipmentName: eq.name, systemName: s.name }]))
    )

    const staleRecords = records
      .filter((record) => !record.deleted_at)
      .filter((record) => isAdmin || record.created_by === session.user.id || grantedRecordIds.has(record.id))
      .map((record) => {
        const days = staleDays(record)
        if (days === null) return null
        const info = equipmentById.get(record.equipment_id)
        return { record, days, systemName: info?.systemName ?? '—', equipmentName: info?.equipmentName ?? '—' }
      })
      .filter(Boolean)

    if (staleRecords.length === 0) return

    openStaleRecordsModal({
      staleRecords,
      onEdit: (record) => {
        openMaintenanceRecordModal({ mode: 'edit', record, systems: state.systems, onSaved: reload })
      },
    })
  }

  async function reload() {
    recordsContainer.innerHTML = '<p class="loading">Loading…</p>'
    try {
      const profile = state.profile ?? (await fetchOwnProfile(session.user.id))
      const isAdmin = profile.role === 'admin'

      const [systems, records, equipmentStatuses, profileNames, grantedRecordIds] = await Promise.all([
        fetchSystemsWithEquipment(),
        fetchMaintenanceRecords({ ...currentRange, includeDeleted: isAdmin && includeDeleted, search: currentSearch }),
        fetchEquipmentStatuses(),
        fetchProfileNames(),
        // An admin already has full access to everything — only worth
        // fetching (and worth granting in the first place) for a regular
        // user's own canEdit check.
        isAdmin ? Promise.resolve(new Set()) : fetchMyRecordAccessIds('maintenance'),
      ])
      state.systems = systems
      state.records = records
      state.profile = profile
      state.equipmentStatuses = equipmentStatuses
      state.profileNames = profileNames
      state.grantedRecordIds = grantedRecordIds

      const currentUserEl = container.querySelector('#current-user')
      if (currentUserEl) {
        currentUserEl.textContent = `${profile.username}${isAdmin ? ' (admin)' : ''}`
      }

      container.querySelector('#manage-users').hidden = !isAdmin

      recordsContainer.innerHTML = renderSystemsHTML(
        systems,
        records,
        { userId: session.user.id, isAdmin, grantedRecordIds },
        equipmentStatuses,
        Boolean(currentSearch.trim())
      )

      if (!staleCheckDone) {
        staleCheckDone = true
        showStaleRecordsIfAny({ systems, records, isAdmin, grantedRecordIds })
      }
    } catch (err) {
      recordsContainer.innerHTML = `<p class="error">Failed to load records: ${escapeHTML(
        err.message || String(err)
      )}</p>`
    }
  }

  await reload()

  return () => {
    unsubscribeFromChanges()
    document.removeEventListener('keydown', handleShortcutKeydown)
  }
}
