import { escapeHTML } from '../lib/html.js'
import { renderBulletList } from '../lib/bullets.js'
import { openModal } from '../lib/modal.js'

export function openViewRecordModal(record, { systemName, equipmentName }) {
  const statusLabel =
    record.work_status === 'Other' && record.work_status_other
      ? record.work_status_other
      : record.work_status

  const { modalEl, close } = openModal(`
    <h2>Maintenance Record</h2>
    <dl class="record-details">
      <dt>System</dt><dd>${escapeHTML(systemName)}</dd>
      <dt>Equipment</dt><dd>${escapeHTML(equipmentName)}</dd>
      <dt>Start date</dt><dd>${escapeHTML(record.start_date)}</dd>
      <dt>End date</dt><dd>${escapeHTML(record.end_date ?? '—')}</dd>
      <dt>Work scope</dt><dd>${escapeHTML(record.work_scope)}</dd>
      <dt>Status</dt><dd>${escapeHTML(statusLabel)}</dd>
      <dt>Detailed steps</dt><dd>${renderBulletList(record.detailed_steps)}</dd>
      <dt>Comment</dt><dd>${renderBulletList(record.comment)}</dd>
    </dl>
    <div class="modal-actions">
      <button type="button" id="view-close">Close</button>
    </div>
  `)

  modalEl.querySelector('#view-close').addEventListener('click', close)
}
