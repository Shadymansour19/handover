import { ICONS } from './icons.js'

// "Very simple formatting" for the multi-line fields (detailed_steps,
// comment, pending) — SPEC.md "simple list formatting for multi-line
// fields". Each line is already one bullet point by convention
// (lib/bullets.js); the only thing this adds is nesting depth, via a
// leading tab character per indent level. A small toolbar (Indent/
// Outdent) sits directly above the textarea it's attached to, and Tab/
// Shift+Tab inside the textarea itself do the same thing — both call the
// same applyToLines() so there's exactly one place the actual text
// manipulation happens.
//
// Deliberately NOT a toggleable "make this line a bullet / not a bullet"
// control: every line in these fields has always been treated as a bullet
// (existing stored data has no per-line marker to say otherwise), so
// adding an explicit "plain paragraph" line type would need a new marker
// and would silently reinterpret every already-saved record. Indentation
// alone is purely additive — a line with no leading tab renders exactly
// as it always has.
function applyToLines(textarea, transform) {
  const { selectionStart, selectionEnd, value } = textarea
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
  let lineEnd = value.indexOf('\n', selectionEnd)
  if (lineEnd === -1) lineEnd = value.length

  const before = value.slice(0, lineStart)
  const after = value.slice(lineEnd)
  const block = value.slice(lineStart, lineEnd)
  const lines = block.split('\n').map(transform)
  const newBlock = lines.join('\n')

  textarea.value = before + newBlock + after
  textarea.selectionStart = lineStart
  textarea.selectionEnd = lineStart + newBlock.length
  // Textareas don't auto-fire input on a scripted .value assignment —
  // nothing here depends on that today, but keeping it consistent with
  // how the field would behave if the user had typed the change avoids a
  // surprise later if a future `input` listener gets added.
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  textarea.focus()
}

const MAX_DEPTH = 5 // generous for "simple" nesting, not unlimited

function indentLine(line) {
  const depth = line.match(/^\t*/)[0].length
  return depth >= MAX_DEPTH ? line : '\t' + line
}

function outdentLine(line) {
  return line.startsWith('\t') ? line.slice(1) : line
}

// If the textarea's previous sibling is a `.field-label-row` (the field's
// label text wrapped in a span — recordModal.js's desktop-width redesign,
// SPEC.md "maintenance record dialog: desktop layout"), the toolbar is
// appended into that row instead of inserted as its own line above the
// textarea — CSS (modal.css) then lays the label text and toolbar out
// side by side on desktop, stacked on mobile, from the same markup.
// Falls back to inserting directly before the textarea for any field that
// doesn't use that wrapper (operationEventModal.js's comment field still
// doesn't), so this works either way without every caller needing to
// change its markup.
export function attachListFormatToolbar(textarea) {
  const toolbar = document.createElement('div')
  toolbar.className = 'list-format-toolbar'
  toolbar.innerHTML = `
    <button type="button" data-action="outdent" title="Decrease indent" aria-label="Decrease indent">${ICONS.outdent}</button>
    <button type="button" data-action="indent" title="Increase indent" aria-label="Increase indent">${ICONS.indent}</button>
  `
  const labelRow = textarea.previousElementSibling
  if (labelRow?.classList.contains('field-label-row')) {
    labelRow.append(toolbar)
  } else {
    textarea.before(toolbar)
  }

  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]')
    if (!button) return
    applyToLines(textarea, button.dataset.action === 'indent' ? indentLine : outdentLine)
  })

  // Tab/Shift+Tab inside the field itself — the natural place to reach
  // for this, and without preventDefault() here Tab would instead jump
  // focus out of the field (the browser's default, unwanted in a
  // multi-line editor like this).
  textarea.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return
    event.preventDefault()
    applyToLines(textarea, event.shiftKey ? outdentLine : indentLine)
  })
}
