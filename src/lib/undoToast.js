// A short-lived "Undo" toast for the common accidental-delete case — see
// SPEC.md "self-service undo after delete". Only ever shown to someone
// the server-side restore RPC will actually let succeed (the record's
// creator, within a 20s window baked into the RPC itself, or an admin —
// see 20261015000000_self_undo_delete.sql) — callers decide that, this
// module just renders the toast and runs the countdown.
export function showUndoToast({ message, onUndo, durationMs = 10000 }) {
  // Only one at a time — a second delete while one's still showing
  // replaces it rather than stacking.
  document.querySelector('.undo-toast')?.remove()

  const toast = document.createElement('div')
  toast.className = 'undo-toast'
  const seconds = Math.ceil(durationMs / 1000)
  toast.innerHTML = `
    <span>${message}</span>
    <button type="button" class="undo-toast__button">Undo (<span class="undo-toast__countdown">${seconds}</span>s)</button>
  `
  document.body.appendChild(toast)

  const countdownEl = toast.querySelector('.undo-toast__countdown')
  let remaining = seconds
  const interval = setInterval(() => {
    remaining -= 1
    countdownEl.textContent = String(Math.max(remaining, 0))
    if (remaining <= 0) dismiss()
  }, 1000)

  function dismiss() {
    clearInterval(interval)
    toast.remove()
  }

  toast.querySelector('.undo-toast__button').addEventListener('click', async () => {
    dismiss()
    await onUndo()
  })
}
