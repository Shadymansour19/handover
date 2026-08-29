import { createMaintenanceRecord, updateMaintenanceRecord } from '../data/maintenanceRecords.js'
import { escapeHTML } from '../lib/html.js'
import { openModal } from '../lib/modal.js'
import { WORK_STATUSES, isTerminalStatus } from '../lib/constants.js'
import { todayISO } from '../lib/dateRange.js'

// Only the Maintenance form exists so far — the Operation tab (Action /
// Timestamp / System / Equipment / Secondary Equipment / Comment) lands in
// Phase 3 alongside operation-event tracking. See PLAN.md.
export function openMaintenanceRecordModal({ mode, record, systems, onSaved }) {
  const isEdit = mode === 'edit'
  const initial = record ?? {
    system_id: '',
    equipment_id: '',
    start_date: todayISO(),
    end_date: null,
    work_scope: '',
    detailed_steps: '',
    work_status: WORK_STATUSES[0],
    work_status_other: '',
    comment: '',
  }

  const systemOptions = systems
    .map(
      (system) =>
        `<option value="${system.id}" ${system.id === initial.system_id ? 'selected' : ''}>${escapeHTML(system.name)}</option>`
    )
    .join('')

  const statusOptions = WORK_STATUSES.map(
    (status) =>
      `<option value="${status}" ${status === initial.work_status ? 'selected' : ''}>${status}</option>`
  ).join('')

  const { modalEl, close } = openModal(`
    <h2>${isEdit ? 'Edit' : 'New'} Maintenance Record</h2>
    <form id="record-form" class="record-form">
      <label>System
        <select id="field-system" required>
          <option value="" disabled ${initial.system_id ? '' : 'selected'}>Select a system…</option>
          ${systemOptions}
        </select>
      </label>
      <label>Equipment
        <select id="field-equipment" required></select>
      </label>
      <label>Start date
        <input type="date" id="field-start-date" value="${initial.start_date}" required />
      </label>
      <label>End date
        <input type="date" id="field-end-date" value="${initial.end_date ?? ''}" disabled />
        <span class="hint">Set automatically once status is Done/Canceled/Held.</span>
      </label>
      <label>Work scope
        <input type="text" id="field-work-scope" value="${escapeHTML(initial.work_scope)}" required />
      </label>
      <label>Detailed steps <span class="hint">(one step per line)</span>
        <textarea id="field-detailed-steps" rows="4">${escapeHTML(initial.detailed_steps ?? '')}</textarea>
      </label>
      <label>Work status
        <select id="field-work-status" required>${statusOptions}</select>
      </label>
      <label id="field-work-status-other-wrap" hidden>Other status (free text)
        <input type="text" id="field-work-status-other" value="${escapeHTML(initial.work_status_other ?? '')}" />
      </label>
      <label>Comment <span class="hint">(one point per line)</span>
        <textarea id="field-comment" rows="3">${escapeHTML(initial.comment ?? '')}</textarea>
      </label>
      <p id="record-form-error" class="status status--error" hidden></p>
      <div class="modal-actions">
        <button type="button" id="record-cancel">Cancel</button>
        <button type="submit">${isEdit ? 'Save changes' : 'Create record'}</button>
      </div>
    </form>
  `)

  const systemSelect = modalEl.querySelector('#field-system')
  const equipmentSelect = modalEl.querySelector('#field-equipment')
  const endDateInput = modalEl.querySelector('#field-end-date')
  const statusSelect = modalEl.querySelector('#field-work-status')
  const otherWrap = modalEl.querySelector('#field-work-status-other-wrap')
  const otherInput = modalEl.querySelector('#field-work-status-other')
  const errorEl = modalEl.querySelector('#record-form-error')
  const form = modalEl.querySelector('#record-form')

  function populateEquipment(systemId, selectedEquipmentId) {
    const system = systems.find((s) => s.id === systemId)
    const options = (system?.equipment ?? [])
      .map(
        (eq) =>
          `<option value="${eq.id}" ${eq.id === selectedEquipmentId ? 'selected' : ''}>${escapeHTML(eq.name)}</option>`
      )
      .join('')
    equipmentSelect.innerHTML =
      `<option value="" disabled ${selectedEquipmentId ? '' : 'selected'}>Select equipment…</option>` + options
  }

  // Mirrors the maintenance_record_biu DB trigger client-side, for
  // immediate feedback — the trigger still enforces this server-side
  // regardless, so this is UX only, not the actual guarantee.
  function syncEndDateState() {
    const terminal = isTerminalStatus(statusSelect.value)
    endDateInput.disabled = !terminal
    if (terminal) {
      if (!endDateInput.value) endDateInput.value = todayISO()
    } else {
      endDateInput.value = ''
    }
  }

  function syncOtherStatusVisibility() {
    const isOther = statusSelect.value === 'Other'
    otherWrap.hidden = !isOther
    otherInput.required = isOther
  }

  systemSelect.addEventListener('change', () => populateEquipment(systemSelect.value, null))
  statusSelect.addEventListener('change', () => {
    syncEndDateState()
    syncOtherStatusVisibility()
  })

  populateEquipment(initial.system_id, initial.equipment_id)
  syncEndDateState()
  syncOtherStatusVisibility()

  modalEl.querySelector('#record-cancel').addEventListener('click', close)

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    errorEl.hidden = true

    const fields = {
      system_id: systemSelect.value,
      equipment_id: equipmentSelect.value,
      start_date: modalEl.querySelector('#field-start-date').value,
      end_date: endDateInput.disabled ? null : endDateInput.value || null,
      work_scope: modalEl.querySelector('#field-work-scope').value.trim(),
      detailed_steps: modalEl.querySelector('#field-detailed-steps').value,
      work_status: statusSelect.value,
      work_status_other: statusSelect.value === 'Other' ? otherInput.value.trim() : null,
      comment: modalEl.querySelector('#field-comment').value,
    }

    const submitButton = form.querySelector('button[type="submit"]')
    submitButton.disabled = true

    try {
      if (isEdit) {
        await updateMaintenanceRecord(record.id, fields)
      } else {
        await createMaintenanceRecord(fields)
      }
      close()
      onSaved?.()
    } catch (err) {
      errorEl.hidden = false
      errorEl.textContent = err.message || 'Failed to save record.'
      submitButton.disabled = false
    }
  })
}
