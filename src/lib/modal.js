// Minimal modal helper shared by recordModal/viewRecordModal — no framework,
// so this just handles the overlay/close/escape-key boilerplate once.
export function openModal(innerHTML) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${innerHTML}</div>`
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
