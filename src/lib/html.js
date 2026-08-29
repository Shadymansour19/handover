// Shared escaping helper for the hand-rolled innerHTML templating used
// throughout views/ — there's no framework doing this automatically.
export function escapeHTML(value) {
  const div = document.createElement('div')
  div.textContent = value ?? ''
  return div.innerHTML
}
