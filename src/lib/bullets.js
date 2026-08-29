import { escapeHTML } from './html.js'

// Multi-line fields (detailed_steps, comment) are stored as plain text with
// \n-separated lines (see SPEC.md "Other assumptions") and rendered as a
// bullet list wherever they're displayed read-only.
export function renderBulletList(text) {
  const lines = (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return '<p class="empty-field">—</p>'

  const items = lines.map((line) => `<li>${escapeHTML(line)}</li>`).join('')
  return `<ul class="bullet-list">${items}</ul>`
}
