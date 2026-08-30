import { createMaintenanceRecord, updateMaintenanceRecord } from '../data/maintenanceRecords.js'
import { escapeHTML } from '../lib/html.js'
import { openModal } from '../lib/modal.js'
import { WORK_STATUSES, isTerminalStatus } from '../lib/constants.js'
import { todayISO } from '../lib/dateRange.js'

// Fills `container` with the Maintenance form and wires it — no modal
// opening here, so this can be embedded either standalone (edit, via
// openMaintenanceRecordModal below) or as one tab's content inside the
// "+ New Record" modal (see newRecordModal.js).
export function renderMaintenanceForm(container, { mode, record, systems, onSaved, onCancel }) {
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

  container.innerHTML = `
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
      <div class="form-row">
        <label>Start date
          <input type="date" id="field-start-date" value="${initial.start_date}" required />
        </label>
        <label>End date
          <input type="date" id="field-end-date" value="${initial.end_date ?? ''}" disabled />
        </label>
      </div>
      <label>Work scope
        <input type="text" id="field-work-scope" value="${escapeHTML(initial.work_scope)}" required />
      </label>
      <label>Detailed steps (one step per line)
        <textarea id="field-detailed-steps" rows="4">${escapeHTML(initial.detailed_steps ?? '')}</textarea>
      </label>
      <label>Work status
        <select id="field-work-status" required>${statusOptions}</select>
      </label>
      <label id="field-work-status-other-wrap" hidden>Other status (free text)
        <input type="text" id="field-work-status-other" value="${escapeHTML(initial.work_status_other ?? '')}" />
      </label>
      <label>Comment (one point per line)
        <textarea id="field-comment" rows="3">${escapeHTML(initial.comment ?? '')}</textarea>
      </label>
      <p id="record-form-error" class="status status--error" hidden></p>
      <div class="modal-actions">
        <button type="button" id="record-cancel">Cancel</button>
        <button type="submit">${isEdit ? 'Save changes' : 'Create record'}</button>
      </div>
    </form>
  `

  const systemSelect = container.querySelector('#field-system')
  const equipmentSelect = container.querySelector('#field-equipment')
  const endDateInput = container.querySelector('#field-end-date')
  const statusSelect = container.querySelector('#field-work-status')
  const otherWrap = container.querySelector('#field-work-status-other-wrap')
  const otherInput = container.querySelector('#field-work-status-other')
  const errorEl = container.querySelector('#record-form-error')
  const form = container.querySelector('#record-form')

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

  container.querySelector('#record-cancel').addEventListener('click', () => onCancel?.())

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    errorEl.hidden = true

    const fields = {
      system_id: systemSelect.value,
      equipment_id: equipmentSelect.value,
      start_date: container.querySelector('#field-start-date').value,
      end_date: endDateInput.disabled ? null : endDateInput.value || null,
      work_scope: container.querySelector('#field-work-scope').value.trim(),
      detailed_steps: container.querySelector('#field-detailed-steps').value,
      work_status: statusSelect.value,
      work_status_other: statusSelect.value === 'Other' ? otherInput.value.trim() : null,
      comment: container.querySelector('#field-comment').value,
    }

    const submitButton = form.querySelector('button[type="submit"]')
    submitButton.disabled = true

    try {
      if (isEdit) {
        await updateMaintenanceRecord(record.id, fields)
      } else {
        await createMaintenanceRecord(fields)
      }
      onSaved?.()
    } catch (err) {
      errorEl.hidden = false
      errorEl.textContent = err.message || 'Failed to save record.'
      submitButton.disabled = false
    }
  })
}

// Standalone modal wrapper — used for the Edit flow (View/Edit/Delete menu
// on an existing record). The "+ New Record" flow instead embeds
// renderMaintenanceForm directly as one tab of newRecordModal.js.
export function openMaintenanceRecordModal({ mode, record, systems, onSaved }) {
  const { modalEl, close } = openModal(`
    <h2>${mode === 'edit' ? 'Edit' : 'New'} Maintenance Record</h2>
    <div id="maintenance-form-container"></div>
  `)

  renderMaintenanceForm(modalEl.querySelector('#maintenance-form-container'), {
    mode,
    record,
    systems,
    onCancel: close,
    onSaved: () => {
      close()
      onSaved?.()
    },
  })
}
