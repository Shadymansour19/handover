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

  // A modal can close three different ways (Close/Cancel button, Escape,
  // clicking the overlay backdrop) — all of them funnel through this one
  // close(), so anything registered via onClose() below is guaranteed to
  // run exactly once no matter which path was taken. historyModal.js needs
  // this for its own document-level "outside click" listener, which would
  // otherwise leak (re-added, never removed) every time History is opened.
  const cleanupFns = []

  function close() {
    cleanupFns.forEach((fn) => fn())
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

  function onClose(fn) {
    cleanupFns.push(fn)
  }

  return { modalEl, close, onClose }
}
