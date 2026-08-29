import { fetchSystemsWithEquipment } from '../data/systemsEquipment.js'
import {
  fetchMaintenanceRecords,
  softDeleteMaintenanceRecord,
  restoreMaintenanceRecord,
  hardDeleteMaintenanceRecord,
} from '../data/maintenanceRecords.js'
import { fetchOwnProfile } from '../data/profiles.js'
import { getDefaultRange } from '../lib/dateRange.js'
import { escapeHTML } from '../lib/html.js'
import { openMaintenanceRecordModal } from './recordModal.js'
import { openViewRecordModal } from './viewRecordModal.js'
import { renderSystemsHTML } from './recordsTable.js'

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
