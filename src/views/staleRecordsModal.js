import { escapeHTML } from '../lib/html.js'
import { openModal } from '../lib/modal.js'
import { formatDateDMY } from '../lib/dateFormat.js'

// Proactively surfaces stale records (lib/staleness.js) to whoever can
// actually act on them — shown once per session (mainView.js only calls
// this right after the initial load, not on every subsequent reload/live-
// sync refresh) rather than needing someone to notice the per-row ⚠
// Stale tag by scrolling. "Take action" here just means "jump straight to
// editing it" — the same Edit modal the row menu's own Edit action opens.
export function openStaleRecordsModal({ staleRecords, onEdit }) {
  const rows = staleRecords
    .map(
      ({ record, days, systemName, equipmentName }) => `
        <tr>
          <td>${escapeHTML(systemName)} — ${escapeHTML(equipmentName)}</td>
          <td>${escapeHTML(record.work_scope)}</td>
          <td>${escapeHTML(record.work_status)}</td>
          <td>${escapeHTML(formatDateDMY(record.start_date))}</td>
          <td>${days} day${days === 1 ? '' : 's'}</td>
          <td><button type="button" data-record-id="${record.id}">Edit</button></td>
        </tr>
      `
    )
    .join('')

  const { modalEl, close } = openModal(
    `
    <h2>Stale Records</h2>
    <p class="hint">
      These records haven't been updated in a while and may need
      attention — a permit sitting still for 4+ days, or work in progress
      for 7+ days with no update.
    </p>
    <table class="records-table">
      <thead>
        <tr><th>Equipment</th><th>Scope</th><th>Status</th><th>Start date</th><th>Stale for</th><th></th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="modal-actions">
      <button type="button" id="stale-records-close">Close</button>
    </div>
  `,
    { wide: true }
  )

  modalEl.querySelector('#stale-records-close').addEventListener('click', close)

  modalEl.querySelector('tbody').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-record-id]')
    if (!button) return
    const { record } = staleRecords.find((s) => s.record.id === button.dataset.recordId)
    close()
    onEdit(record)
  })
}
