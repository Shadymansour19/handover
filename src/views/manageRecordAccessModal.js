import { escapeHTML } from '../lib/html.js'
import { openModal } from '../lib/modal.js'
import { fetchRecordAccess, setRecordAccess } from '../data/recordAccess.js'

// Admin-only: grant/revoke specific OTHER (non-admin, non-creator) users
// edit/delete access to one record — see SPEC.md "per-record access
// grants". Shared between the maintenance-records table and the History
// modal (recordType: 'maintenance' | 'operation') rather than two
// near-identical modals, since the only real difference is which grants
// table setRecordAccess()/fetchRecordAccess() talk to.
export async function openManageRecordAccessModal({ recordType, recordId, creatorId, users, onSaved }) {
  // Only active, non-admin users can be granted access — an admin already
  // has full access to everything regardless, and the creator already
  // does too, so neither belongs in this list.
  const candidates = users.filter((u) => u.role !== 'admin' && u.is_active && u.id !== creatorId)

  const { modalEl, close } = openModal(`
    <h2>Manage Access</h2>
    <p class="hint">
      Let specific other users edit or delete this record, in addition to
      its creator and admins.
    </p>
    <div id="access-list">
      ${candidates.length === 0 ? '<p class="empty">No other users to grant access to.</p>' : '<p class="loading">Loading…</p>'}
    </div>
    <p id="access-error" class="status status--error" hidden></p>
    <div class="modal-actions">
      <button type="button" id="access-cancel">Cancel</button>
      ${candidates.length > 0 ? '<button type="button" id="access-save">Save</button>' : ''}
    </div>
  `)

  modalEl.querySelector('#access-cancel').addEventListener('click', close)

  const listEl = modalEl.querySelector('#access-list')
  const errorEl = modalEl.querySelector('#access-error')
  const saveButton = modalEl.querySelector('#access-save')

  if (candidates.length > 0) {
    try {
      const grantedIds = new Set(await fetchRecordAccess(recordType, recordId))
      listEl.innerHTML = `
        <div class="access-checklist">
          ${candidates
            .map(
              (u) => `
                <label class="checkbox-label">
                  <input type="checkbox" value="${u.id}" ${grantedIds.has(u.id) ? 'checked' : ''} />
                  ${escapeHTML(u.full_name || u.username)}
                </label>
              `
            )
            .join('')}
        </div>
      `
    } catch (err) {
      listEl.innerHTML = `<p class="error">Failed to load access: ${escapeHTML(err.message || String(err))}</p>`
    }

    saveButton.addEventListener('click', async () => {
      errorEl.hidden = true
      const checkedIds = [...modalEl.querySelectorAll('#access-list input[type="checkbox"]:checked')].map(
        (el) => el.value
      )

      saveButton.disabled = true
      try {
        await setRecordAccess(recordType, recordId, checkedIds)
        close()
        onSaved?.()
      } catch (err) {
        errorEl.hidden = false
        errorEl.textContent = err.message || 'Failed to save access.'
        saveButton.disabled = false
      }
    })
  }
}
