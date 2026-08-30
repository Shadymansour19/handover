import { ICONS } from './icons.js'

// A built-in browser "reveal password" control isn't reliable to depend
// on — it varies by browser/OS and settings (desktop Chrome/Edge often
// show one, but mobile Chrome only under certain conditions and iOS
// Safari doesn't show one for an arbitrary password field at all) — so
// every password field in the app gets its own explicit toggle button
// instead, wrapped in `.password-field` (see base.css) with a
// `[data-toggle-password]` button as the input's next sibling.
//
// Call once per rendered form/screen, e.g.
// `initPasswordToggles(container)` or `initPasswordToggles(modalEl)`.
export function initPasswordToggles(root) {
  root.querySelectorAll('[data-toggle-password]').forEach((button) => {
    const input = button.previousElementSibling
    if (!input || (input.type !== 'password' && input.type !== 'text')) return

    button.addEventListener('click', () => {
      const nowShowing = input.type === 'password'
      input.type = nowShowing ? 'text' : 'password'
      button.innerHTML = nowShowing ? ICONS.eyeOff : ICONS.eye
      const label = nowShowing ? 'Hide password' : 'Show password'
      button.title = label
      button.setAttribute('aria-label', label)
    })
  })
}

// The markup each password field needs — kept in one place so every call
// site stays in sync (wrapper class, button attributes, icon) rather than
// hand-repeating the HTML string five times across four files.
export function passwordFieldHTML(inputHTML) {
  return `<div class="password-field">${inputHTML}<button type="button" class="password-toggle" data-toggle-password title="Show password" aria-label="Show password">${ICONS.eye}</button></div>`
}
