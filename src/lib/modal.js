// Minimal modal helper shared by recordModal/viewRecordModal/historyModal —
// no framework, so this just handles the overlay/close/escape-key
// boilerplate once. Pass { wide: true } for content that needs more room
// than the default form width (e.g. historyModal's table).
export function openModal(innerHTML, { wide = false } = {}) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal${wide ? ' modal--wide' : ''}" role="dialog" aria-modal="true">${innerHTML}</div>`
  document.body.appendChild(overlay)

  const modalEl = overlay.querySelector('.modal')

  function close() {
    overlay.remove()
    document.removeEventListener('keydown', onKeydown)
  }

  function onKeydown(event) {
    if (event.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKeydown)

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close()
  })

  return { modalEl, close }
}
