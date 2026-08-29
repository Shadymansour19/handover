import {
  createOperationEvent,
  updateOperationEvent,
  fetchEquipmentStatuses,
} from '../data/operationEvents.js'
import { escapeHTML } from '../lib/html.js'
import { openModal } from '../lib/modal.js'
import { ACTIONS } from '../lib/constants.js'
import { nowLocalDatetimeInput, toLocalDatetimeInput } from '../lib/dateRange.js'
import {
  filterEquipmentForAction,
  filterEquipmentForSecondary,
  getStatus,
  validateOperationEvent,
} from '../lib/equipmentStatus.js'

// Fills `container` with the Operation form and wires it. Field order
// (Action -> Timestamp -> System -> Equipment -> Secondary -> Comment)
// matches SPEC.md exactly — Action comes first because it determines which
// equipment is even selectable.
//
// Live-status validation (the "already Running/Stopped" rules) only
// applies on create. Editing an existing (possibly old) event against
// today's live equipment status doesn't make sense — e.g. fixing a typo in
// a comment on a 3-day-old Run event shouldn't fail because the equipment
// happens to be Stopped for unrelated reasons right now. Ownership/admin
// RLS still governs who can edit at all.
export function renderOperationForm(container, { mode, record, systems, equipmentStatuses, onSaved, onCancel }) {
  const isEdit = mode === 'edit'
  const trackedSystems = systems.filter((s) => s.operation_tracked)

  const initial = record ?? {
    action: '',
    event_timestamp: null,
    system_id: '',
    equipment_id: '',
    secondary_equipment_id: '',
    comment: '',
  }

  const actionOptions = ACTIONS.map(
    (action) =>
      `<option value="${action}" ${action === initial.action ? 'selected' : ''}>${action}</option>`
  ).join('')

  const systemOptions = trackedSystems
    .map(
      (system) =>
        `<option value="${system.id}" ${system.id === initial.system_id ? 'selected' : ''}>${escapeHTML(system.name)}</option>`
    )
    .join('')

  const timestampValue = initial.event_timestamp
    ? toLocalDatetimeInput(new Date(initial.event_timestamp))
    : nowLocalDatetimeInput()

  container.innerHTML = `
    <form id="operation-form" class="record-form">
      <label>Action
        <select id="field-action" required>
          <option value="" disabled ${initial.action ? '' : 'selected'}>Select an action…</option>
          ${actionOptions}
        </select>
      </label>
      <label>Timestamp
        <input type="datetime-local" id="field-timestamp" value="${timestampValue}" required />
      </label>
      <label>System
        <select id="field-system" required>
          <option value="" disabled ${initial.system_id ? '' : 'selected'}>Select a system…</option>
          ${systemOptions}
        </select>
      </label>
      <label>Equipment
        <select id="field-equipment" required></select>
      </label>
      <label id="field-secondary-wrap" hidden>Secondary equipment
        <select id="field-secondary"></select>
      </label>
      <label>Comment <span class="hint">(one point per line)</span>
        <textarea id="field-comment" rows="3">${escapeHTML(initial.comment ?? '')}</textarea>
      </label>
      <p id="operation-form-error" class="status status--error" hidden></p>
      <div class="modal-actions">
        <button type="button" id="operation-cancel">Cancel</button>
        <button type="submit">${isEdit ? 'Save changes' : 'Create event'}</button>
      </div>
    </form>
  `

  const actionSelect = container.querySelector('#field-action')
  const timestampInput = container.querySelector('#field-timestamp')
  const systemSelect = container.querySelector('#field-system')
  const equipmentSelect = container.querySelector('#field-equipment')
  const secondaryWrap = container.querySelector('#field-secondary-wrap')
  const secondarySelect = container.querySelector('#field-secondary')
  const errorEl = container.querySelector('#operation-form-error')
  const form = container.querySelector('#operation-form')

  function trackedEquipment(systemId) {
    const system = trackedSystems.find((s) => s.id === systemId)
    return (system?.equipment ?? []).filter((eq) => !eq.is_generic)
  }

  function optionsHTML(list, selectedId, placeholder) {
    if (list.length === 0) {
      return `<option value="" disabled selected>${escapeHTML(placeholder.empty)}</option>`
    }
    const options = list
      .map(
        (eq) =>
          `<option value="${eq.id}" ${eq.id === selectedId ? 'selected' : ''}>${escapeHTML(eq.name)}</option>`
      )
      .join('')
    return (
      `<option value="" disabled ${selectedId ? '' : 'selected'}>${escapeHTML(placeholder.default)}</option>` +
      options
    )
  }

  function populateEquipment(systemId, selectedId) {
    if (!systemId) {
      equipmentSelect.innerHTML = '<option value="" disabled selected>Select a system first…</option>'
      return
    }
    let list = trackedEquipment(systemId)
    if (!isEdit && actionSelect.value) {
      list = filterEquipmentForAction(list, equipmentStatuses, actionSelect.value)
    }
    equipmentSelect.innerHTML = optionsHTML(list, selectedId, {
      default: 'Select equipment…',
      empty: 'No eligible equipment for this action',
    })
  }

  function populateSecondary(systemId, selectedId) {
    if (actionSelect.value !== 'Swap') {
      secondaryWrap.hidden = true
      secondarySelect.required = false
      return
    }
    secondaryWrap.hidden = false
    secondarySelect.required = true

    if (!systemId) {
      secondarySelect.innerHTML = '<option value="" disabled selected>Select a system first…</option>'
      return
    }

    let list = trackedEquipment(systemId)
    const primaryId = equipmentSelect.value
    list = isEdit
      ? list.filter((eq) => eq.id !== primaryId)
      : filterEquipmentForSecondary(list, equipmentStatuses, primaryId)

    secondarySelect.innerHTML = optionsHTML(list, selectedId, {
      default: 'Select secondary equipment…',
      empty: 'No eligible Stopped equipment for a swap',
    })
  }

  function refreshEquipmentAndSecondary() {
    populateEquipment(systemSelect.value, null)
    populateSecondary(systemSelect.value, null)
  }

  actionSelect.addEventListener('change', refreshEquipmentAndSecondary)
  systemSelect.addEventListener('change', refreshEquipmentAndSecondary)
  equipmentSelect.addEventListener('change', () => populateSecondary(systemSelect.value, null))

  populateEquipment(initial.system_id, initial.equipment_id)
  populateSecondary(initial.system_id, initial.secondary_equipment_id)

  container.querySelector('#operation-cancel').addEventListener('click', () => onCancel?.())

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    errorEl.hidden = true

    const fields = {
      action: actionSelect.value,
      event_timestamp: new Date(timestampInput.value).toISOString(),
      system_id: systemSelect.value,
      equipment_id: equipmentSelect.value,
      secondary_equipment_id: actionSelect.value === 'Swap' ? secondarySelect.value : null,
      comment: container.querySelector('#field-comment').value,
    }

    const submitButton = form.querySelector('button[type="submit"]')
    submitButton.disabled = true

    try {
      if (!isEdit) {
        // Re-fetch right before submit rather than trusting the snapshot
        // the modal opened with — closes most of the race window between
        // "dropdown was populated" and "insert actually happens".
        const freshStatuses = await fetchEquipmentStatuses()
        const validationError = validateOperationEvent({
          action: fields.action,
          primaryStatus: getStatus(freshStatuses, fields.equipment_id),
          secondaryStatus: fields.secondary_equipment_id
            ? getStatus(freshStatuses, fields.secondary_equipment_id)
            : null,
        })
        if (validationError) {
          throw new Error(validationError)
        }
        await createOperationEvent(fields)
      } else {
        await updateOperationEvent(record.id, fields)
      }
      onSaved?.()
    } catch (err) {
      errorEl.hidden = false
      errorEl.textContent = err.message || 'Failed to save event.'
      submitButton.disabled = false
    }
  })
}

// Standalone modal wrapper — used by the History modal's Edit action.
export function openOperationEventModal({ mode, record, systems, equipmentStatuses, onSaved }) {
  const { modalEl, close } = openModal(`
    <h2>${mode === 'edit' ? 'Edit' : 'New'} Operation Event</h2>
    <div id="operation-form-container"></div>
  `)

  renderOperationForm(modalEl.querySelector('#operation-form-container'), {
    mode,
    record,
    systems,
    equipmentStatuses,
    onCancel: close,
    onSaved: () => {
      close()
      onSaved?.()
    },
  })
}
