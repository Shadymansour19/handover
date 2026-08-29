import { openModal } from '../lib/modal.js'
import { renderMaintenanceForm } from './recordModal.js'
import { renderOperationForm } from './operationEventModal.js'

// "+ New Record" — a single modal with a Maintenance/Operation tab toggle
// (SPEC.md). Both tabs are always create-mode; editing an existing record
// of either type goes through its own standalone modal instead
// (openMaintenanceRecordModal / openOperationEventModal), not this one.
export function openNewRecordModal({ systems, equipmentStatuses, onSaved }) {
  const { modalEl, close } = openModal(`
    <h2>New Record</h2>
    <div class="tab-switch" role="tablist">
      <button type="button" class="tab-button" data-tab="maintenance" aria-selected="true">Maintenance</button>
      <button type="button" class="tab-button" data-tab="operation" aria-selected="false">Operation</button>
    </div>
    <div id="tab-content"></div>
  `)

  const tabButtons = modalEl.querySelectorAll('.tab-button')
  const tabContent = modalEl.querySelector('#tab-content')

  function handleSaved() {
    close()
    onSaved?.()
  }

  function activateTab(tab) {
    tabButtons.forEach((button) => {
      const active = button.dataset.tab === tab
      button.classList.toggle('active', active)
      button.setAttribute('aria-selected', String(active))
    })

    if (tab === 'maintenance') {
      renderMaintenanceForm(tabContent, {
        mode: 'create',
        systems,
        onCancel: close,
        onSaved: handleSaved,
      })
    } else {
      renderOperationForm(tabContent, {
        mode: 'create',
        systems,
        equipmentStatuses,
        onCancel: close,
        onSaved: handleSaved,
      })
    }
  }

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => activateTab(button.dataset.tab))
  })

  activateTab('maintenance')
}
