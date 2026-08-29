import { fetchSystemsWithEquipment } from '../data/systemsEquipment.js'
import { fetchMaintenanceRecords } from '../data/maintenanceRecords.js'
import { fetchOwnProfile } from '../data/profiles.js'
import { getDefaultRange } from '../lib/dateRange.js'

// Phase 1 slice: auth + read-only grouped display only. View/Edit/Delete,
// operation tracking, and export land in later phases (see PLAN.md) — the
// action buttons below are visible but disabled on purpose.
export async function renderMainView(container, { session, onSignOut }) {
  const range = getDefaultRange()

  container.innerHTML = `
    <header class="app-header">
      <h1>Handover</h1>
      <div class="app-header__user">
        <span id="current-user">${escapeHTML(session.user.email)}</span>
        <button id="sign-out" type="button">Sign out</button>
      </div>
    </header>
    <form id="date-filter" class="date-filter">
      <label>From <input type="date" id="filter-from" value="${range.from}" /></label>
      <label>To <input type="date" id="filter-to" value="${range.to}" /></label>
      <button type="submit">Apply</button>
    </form>
    <div id="records-container" class="records-container">
      <p class="loading">Loading…</p>
    </div>
  `

  container.querySelector('#sign-out').addEventListener('click', onSignOut)

  const form = container.querySelector('#date-filter')
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const from = container.querySelector('#filter-from').value
    const to = container.querySelector('#filter-to').value
    loadAndRenderRecords(container, { from, to })
  })

  // Swap the header's email placeholder for username + role once the
  // profile loads — doesn't block the records below from loading.
  fetchOwnProfile(session.user.id)
    .then((profile) => {
      const el = container.querySelector('#current-user')
      if (!el) return
      const roleTag = profile.role === 'admin' ? ' (admin)' : ''
      el.textContent = `${profile.username}${roleTag}`
    })
    .catch(() => {
      // Header keeps showing the email — not worth a visible error for this.
    })

  await loadAndRenderRecords(container, range)
}

async function loadAndRenderRecords(container, range) {
  const recordsContainer = container.querySelector('#records-container')
  recordsContainer.innerHTML = '<p class="loading">Loading…</p>'

  try {
    const [systems, records] = await Promise.all([
      fetchSystemsWithEquipment(),
      fetchMaintenanceRecords(range),
    ])
    recordsContainer.innerHTML = renderSystemsHTML(systems, records)
  } catch (err) {
    recordsContainer.innerHTML = `<p class="error">Failed to load records: ${escapeHTML(
      err.message || String(err)
    )}</p>`
  }
}

function renderSystemsHTML(systems, records) {
  const sections = systems
    .map((system) => renderSystemSection(system, records))
    .filter(Boolean)

  if (sections.length === 0) {
    return '<p class="empty">No maintenance records in this date range.</p>'
  }
  return sections.join('\n')
}

function renderSystemSection(system, records) {
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
    .map((eq) => renderEquipmentSection(eq, systemRecords))
    .join('\n')

  return `
    <section class="system-section">
      <h2 class="system-banner">${escapeHTML(system.name)}</h2>
      ${equipmentSections}
    </section>
  `
}

function renderEquipmentSection(equipment, systemRecords) {
  const records = systemRecords
    .filter((r) => r.equipment_id === equipment.id)
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))

  const rows = records.length
    ? records.map(renderRecordRow).join('\n')
    : '<tr><td colspan="4" class="no-records">No records in range</td></tr>'

  return `
    <div class="equipment-block">
      <h3 class="equipment-header">${escapeHTML(equipment.name)}</h3>
      <table class="records-table">
        <thead>
          <tr><th>Start date</th><th>Scope</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

function renderRecordRow(record) {
  const status =
    record.work_status === 'Other' && record.work_status_other
      ? record.work_status_other
      : record.work_status

  return `
    <tr>
      <td>${escapeHTML(record.start_date)}</td>
      <td>${escapeHTML(record.work_scope)}</td>
      <td>${escapeHTML(status)}</td>
      <td class="actions">
        <button disabled title="Coming in Phase 2">View</button>
        <button disabled title="Coming in Phase 2">Edit</button>
        <button disabled title="Coming in Phase 2">Delete</button>
      </td>
    </tr>
  `
}

function escapeHTML(value) {
  const div = document.createElement('div')
  div.textContent = value ?? ''
  return div.innerHTML
}
