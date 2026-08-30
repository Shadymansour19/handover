import { openModal } from '../lib/modal.js'

// Date-range + (admin-only) "show deleted" filter, as a dialog. Used to be
// an always-visible inline form in the toolbar; moved into a modal as part
// of the floating-action-button redesign (see mainView.js) so the toolbar
// itself can stay hidden until Filter is actually clicked. Rebuilt fresh
// every open, so it always reflects the caller's current values/isAdmin
// rather than needing its own show/hide toggling the way the old inline
// checkbox did.
export function openFilterModal({ from, to, includeDeleted, isAdmin, onApply }) {
  const { modalEl, close } = openModal(`
    <h2>Filter Records</h2>
    <form id="filter-form" class="record-form">
      <div class="form-row">
        <label>From <input type="date" id="filter-from" value="${from}" required /></label>
        <label>To <input type="date" id="filter-to" value="${to}" required /></label>
      </div>
      ${
        isAdmin
          ? `<label class="checkbox-label">
               <input type="checkbox" id="filter-show-deleted" ${includeDeleted ? 'checked' : ''} /> Show deleted
             </label>`
          : ''
      }
      <div class="modal-actions">
        <button type="button" id="filter-cancel">Cancel</button>
        <button type="submit">Apply</button>
      </div>
    </form>
  `)

  modalEl.querySelector('#filter-cancel').addEventListener('click', close)

  modalEl.querySelector('#filter-form').addEventListener('submit', (event) => {
    event.preventDefault()
    const showDeletedInput = modalEl.querySelector('#filter-show-deleted')
    onApply({
      from: modalEl.querySelector('#filter-from').value,
      to: modalEl.querySelector('#filter-to').value,
      includeDeleted: showDeletedInput ? showDeletedInput.checked : includeDeleted,
    })
    close()
  })
}
