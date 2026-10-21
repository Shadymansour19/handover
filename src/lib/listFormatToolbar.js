import { ICONS } from './icons.js'
import { getSelectedLines, MAX_DEPTH } from './richTextField.js'

// "Very simple formatting" for the multi-line fields (detailed_steps,
// comment, pending) — SPEC.md "simple list formatting for multi-line
// fields" and its "live bold/bullet rendering in the editor" follow-up.
// These fields are lib/richTextField.js's contenteditable model (one
// `.rich-line` div per line, `data-depth` driving nesting); this file is
// just the toolbar/keyboard layer on top of it — Outdent/Indent/Bold
// buttons, plus Tab/Shift+Tab/Ctrl+B doing the same things inside the
// field itself, both calling the same functions below so there's exactly
// one place each piece of text manipulation happens.
//
// Deliberately NOT a toggleable "make this line a bullet / not a bullet"
// control: every line in these fields has always been treated as a bullet
// (existing stored data has no per-line marker to say otherwise), so
// adding an explicit "plain paragraph" line type would need a new marker
// and would silently reinterpret every already-saved record. Indentation
// alone is purely additive — a line at depth 0 renders exactly as it
// always has.
function changeIndent(el, delta) {
  const lines = getSelectedLines(el)
  if (lines.length === 0) return
  for (const line of lines) {
    const depth = parseInt(line.dataset.depth || '0', 10) || 0
    line.dataset.depth = String(Math.max(0, Math.min(MAX_DEPTH, depth + delta)))
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

// Toggles **bold** on the current selection via the browser's own native
// Bold command rather than hand-rolling the DOM/Range surgery a correct
// toggle needs (splitting a partially-bold selection, merging adjacent
// bold runs, etc.) — execCommand('bold') already handles all of that
// reliably; it's deprecated as a spec but still universally supported for
// exactly this kind of simple boolean toggle. Browsers already bind
// Ctrl+B to this natively inside a contenteditable region, but it's called
// explicitly here too (see the keydown handler below) rather than relying
// on that, so behavior doesn't depend on a browser default this app
// doesn't control.
function toggleBold(el) {
  el.focus()
  document.execCommand('bold')
}

// If the field's previous sibling is a `.field-label-row` (the field's
// label text wrapped in a span — recordModal.js's desktop-width redesign,
// SPEC.md "maintenance record dialog: desktop layout"), the toolbar is
// appended into that row instead of inserted as its own line above the
// field — CSS (modal.css) then lays the label text and toolbar out side by
// side on desktop, stacked on mobile, from the same markup. Falls back to
// inserting directly before the field for any that doesn't use that
// wrapper (operationEventModal.js's comment field still doesn't), so this
// works either way without every caller needing to change its markup.
export function attachListFormatToolbar(el) {
  const toolbar = document.createElement('div')
  toolbar.className = 'list-format-toolbar'
  toolbar.innerHTML = `
    <button type="button" data-action="outdent" title="Decrease indent" aria-label="Decrease indent">${ICONS.outdent}</button>
    <button type="button" data-action="indent" title="Increase indent" aria-label="Increase indent">${ICONS.indent}</button>
    <button type="button" data-action="bold" title="Bold (Ctrl+B)" aria-label="Bold">${ICONS.bold}</button>
  `
  const labelRow = el.previousElementSibling
  if (labelRow?.classList.contains('field-label-row')) {
    labelRow.append(toolbar)
  } else {
    el.before(toolbar)
  }

  // Both fields (detailed_steps/comment/pending, and operation events'
  // own comment) have this toolbar as a sibling of theirs inside the SAME
  // <label> as their field — and a <label> containing a <button>
  // forwards EVERY click anywhere inside it to that button, including a
  // click landing directly on the field itself, not just on the button.
  // That's standard (if obscure) label semantics — a label with multiple
  // labelable children just picks one to always activate — not a bug in
  // this code, but it makes the field unfocusable by clicking it at all
  // once a toolbar button exists inside the same label. Worked around by
  // intercepting the label's own click, before the browser's default
  // forwarding runs, and sending focus to the actual field instead unless
  // the click was genuinely on a toolbar button.
  const label = el.closest('label')
  if (label) {
    label.addEventListener('click', (event) => {
      if (event.target.closest('button')) return
      event.preventDefault()
      el.focus()
    })
  }

  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]')
    if (!button) return
    if (button.dataset.action === 'bold') {
      toggleBold(el)
    } else {
      changeIndent(el, button.dataset.action === 'indent' ? 1 : -1)
    }
  })

  // Tab/Shift+Tab inside the field itself — the natural place to reach
  // for this, and without preventDefault() here Tab would instead jump
  // focus out of the field (the browser's default, unwanted in a
  // multi-line editor like this). Ctrl+B (Cmd+B on Mac) alongside it for
  // Bold — scoped to inside the field, so it doesn't collide with
  // mainView.js's own global N/F/O/P shortcuts (those already skip
  // themselves whenever focus is in a text field).
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault()
      changeIndent(el, event.shiftKey ? -1 : 1)
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault()
      toggleBold(el)
    }
  })
}
