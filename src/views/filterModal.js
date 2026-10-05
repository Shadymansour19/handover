import { openModal } from '../lib/modal.js'
import { escapeHTML } from '../lib/html.js'
import { getDefaultRange, getLast30DaysRange, getThisMonthRange } from '../lib/dateRange.js'

// Date-range + text search + (admin-only) "show deleted" filter, as a
// dialog. Used to be an always-visible inline form in the toolbar; moved
// into a modal as part of the floating-action-button redesign (see
// mainView.js) so the toolbar itself can stay hidden until Filter is
// actually clicked. Rebuilt fresh every open, so it always reflects the
// caller's current values/isAdmin rather than needing its own show/hide
// toggling the way the old inline checkbox did.
//
// Presets just fill the From/To inputs rather than auto-submitting — the
// date range is probably the single most repeated action in the app, but
// someone picking a preset might still want to add a search term or
// toggle Show Deleted before applying, so this doesn't close the dialog
// for them.
const PRESETS = [
  { label: 'Last 7 days', getRange: getDefaultRange },
  { label: 'Last 30 days', getRange: getLast30DaysRange },
  { label: 'This month', getRange: getThisMonthRange },
]

export function openFilterModal({ from, to, search, includeDeleted, isAdmin, onApply }) {
  const presetButtons = PRESETS.map(
    (preset, index) => `<button type="button" class="preset-button" data-preset-index="${index}">${preset.label}</button>`
  ).join('')

  const { modalEl, close } = openModal(`
    <h2>Filter Records</h2>
    <form id="filter-form" class="record-form">
      <div class="preset-buttons">${presetButtons}</div>
      <div class="form-row">
        <label>From <input type="date" id="filter-from" value="${from}" required /></label>
        <label>To <input type="date" id="filter-to" value="${to}" required /></label>
      </div>
      <label>Search
        <input type="text" id="filter-search" value="${escapeHTML(search ?? '')}"
               placeholder="Scope, detailed steps, or comment" />
      </label>
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

  modalEl.querySelector('.preset-buttons').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-preset-index]')
    if (!button) return
    const { from: presetFrom, to: presetTo } = PRESETS[Number(button.dataset.presetIndex)].getRange()
    modalEl.querySelector('#filter-from').value = presetFrom
    modalEl.querySelector('#filter-to').value = presetTo
  })

  modalEl.querySelector('#filter-form').addEventListener('submit', (event) => {
    event.preventDefault()
    const showDeletedInput = modalEl.querySelector('#filter-show-deleted')
    onApply({
      from: modalEl.querySelector('#filter-from').value,
      to: modalEl.querySelector('#filter-to').value,
      search: modalEl.querySelector('#filter-search').value,
      includeDeleted: showDeletedInput ? showDeletedInput.checked : includeDeleted,
    })
    close()
  })
}
