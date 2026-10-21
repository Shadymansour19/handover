// A `contenteditable` replacement for the plain `<textarea>` multi-line
// fields (detailed_steps, comment, pending, and operation events' own
// comment) — SPEC.md "live bold/bullet rendering in the editor". A plain
// `<textarea>` can only ever show uniform text, so showing **bold**
// markers and nested bullets as they'll actually look (instead of the
// literal markers/tabs) means replacing it with something that can mix
// inline formatting — this is that something, kept as small as it can be
// rather than pulling in a full rich-text editor library.
//
// Model: one child `<div class="rich-line" data-depth="N">` per line,
// holding a mix of text nodes and `<strong>` elements for bold runs.
// `data-depth` (not literal leading tabs in the DOM) drives both the
// visual indent and the bullet glyph via CSS (records.css) — tabs only
// exist in the serialized plain-text form (getRichTextValue), matching
// what lib/bullets.js/the exports already expect.
import { parseInlineBold } from './inlineFormatting.js'

export const MAX_DEPTH = 5 // same cap as the exports' bullet levels

function getLineElement(node) {
  let el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node
  while (el && !(el.classList && el.classList.contains('rich-line'))) el = el.parentElement
  return el
}

// Treats a lone empty text node the same as truly having no children —
// `Range.extractContents()`/`deleteContents()` routinely leave one behind
// as a split artifact exactly at a text node's boundary (e.g. splitting a
// line at the very end of its text, the common case for pressing Enter at
// the end of a line) — and, the same way, an empty `<strong>`/`<b>` when
// the boundary instead sits at the edge of a bold run (pressing Enter
// right after bolding the last word on a line) — even though nothing was
// actually extracted/deleted there. Checking only `childNodes.length ===
// 0` or "exactly one `<br>`" missed both cases, so a line produced this
// way looked non-empty and never got its needed `<br>` — invisible and,
// because contenteditable collapses a childless block to zero height,
// entirely unable to receive the cursor afterward. Recurses so a bold
// element counts as content only if ITS children do, not just for
// existing — `<strong></strong>` has none.
function hasVisibleContent(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent !== ''
  if (node.nodeName === 'BR') return false
  return Array.from(node.childNodes).some(hasVisibleContent)
}

function isEmptyLine(line) {
  return !hasVisibleContent(line)
}

// Every line needs at least a `<br>` to have a real height and be a valid
// cursor target when it has no text content — the same reason an empty
// `<div>`/`<p>` collapses to zero height in any contenteditable region.
function ensureNotEmpty(line) {
  if (hasVisibleContent(line)) return
  line.innerHTML = ''
  line.appendChild(document.createElement('br'))
}

function createLineElement(depth, content) {
  const line = document.createElement('div')
  line.className = 'rich-line'
  line.dataset.depth = String(Math.min(depth, MAX_DEPTH))
  for (const segment of parseInlineBold(content)) {
    if (!segment.text) continue
    if (segment.bold) {
      const strong = document.createElement('strong')
      strong.textContent = segment.text
      line.appendChild(strong)
    } else {
      line.appendChild(document.createTextNode(segment.text))
    }
  }
  ensureNotEmpty(line)
  return line
}

// Parses the stored plain-text form (leading tabs for depth, **bold**
// markers — see lib/bullets.js) into the line-div model above. Used both
// for a field's initial value (Edit mode) and, in principle, any time the
// field's content needs to be replaced wholesale.
export function setRichTextValue(el, text) {
  el.innerHTML = ''
  const rawLines = (text ?? '').split('\n')
  if (rawLines.length === 1 && rawLines[0] === '') {
    el.appendChild(createLineElement(0, ''))
    return
  }
  for (const raw of rawLines) {
    const depth = raw.match(/^\t*/)[0].length
    el.appendChild(createLineElement(depth, raw.slice(depth)))
  }
}

function serializeLine(line) {
  const depth = Math.min(parseInt(line.dataset.depth || '0', 10) || 0, MAX_DEPTH)
  let content = ''
  for (const node of line.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      content += node.textContent
    } else if (node.nodeName === 'STRONG' || node.nodeName === 'B') {
      if (node.textContent) content += `**${node.textContent}**`
    } else if (node.nodeName !== 'BR') {
      // Shouldn't normally occur (paste is forced to plain text below),
      // but falls back to the element's own text rather than silently
      // dropping it if something unexpected ever ends up in there.
      content += node.textContent
    }
  }
  return '\t'.repeat(depth) + content
}

// The inverse of setRichTextValue() — what recordModal.js/
// operationEventModal.js read on submit, in place of a textarea's
// `.value`.
export function getRichTextValue(el) {
  const lines = Array.from(el.children).filter((child) => child.classList.contains('rich-line'))
  return lines.map(serializeLine).join('\n')
}

// Every line-div touched by the current selection, in document order —
// used by lib/listFormatToolbar.js's Indent/Outdent so a multi-line
// selection indents every line it spans, not just the one the selection
// starts in.
export function getSelectedLines(el) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return []
  const range = selection.getRangeAt(0)
  if (!el.contains(range.commonAncestorContainer)) return []

  const startLine = getLineElement(range.startContainer)
  const endLine = getLineElement(range.endContainer)
  if (!startLine || !endLine) return []

  const allLines = Array.from(el.children).filter((child) => child.classList.contains('rich-line'))
  const startIdx = allLines.indexOf(startLine)
  const endIdx = allLines.indexOf(endLine)
  if (startIdx === -1 || endIdx === -1) return []

  return allLines.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1)
}

// Splits the current line at the cursor — everything after the cursor
// moves into a new line inserted right after it, which inherits the
// current line's depth (continuing a nested bullet keeps its indent until
// explicitly outdented, matching how most list editors treat Enter).
// Replaces the field's default Enter handling entirely (the caller
// preventDefault()s it) rather than relying on the browser's own
// cross-browser-inconsistent block-splitting behavior.
function insertLineBreak(el) {
  const selection = window.getSelection()
  if (!selection.rangeCount) return
  const range = selection.getRangeAt(0)

  // A non-collapsed selection (some text highlighted when Enter is
  // pressed) is deleted first, same as typing any other character over a
  // selection would — collapses the range to the deletion point, so the
  // split logic below only ever has to deal with a single cursor position.
  if (!range.collapsed) {
    range.deleteContents()
    range.collapse(true)
  }

  const currentLine = getLineElement(range.startContainer)
  if (!currentLine) return

  const afterRange = document.createRange()
  afterRange.setStart(range.startContainer, range.startOffset)
  afterRange.setEndAfter(currentLine.lastChild)
  const afterContents = afterRange.extractContents()

  const newLine = document.createElement('div')
  newLine.className = 'rich-line'
  newLine.dataset.depth = currentLine.dataset.depth || '0'
  newLine.appendChild(afterContents)
  ensureNotEmpty(newLine)
  ensureNotEmpty(currentLine)
  currentLine.after(newLine)

  const newRange = document.createRange()
  newRange.setStart(newLine, 0)
  newRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(newRange)
}

// Backspace at the very start of a line's own content merges it into the
// end of the previous line instead, run by hand rather than trusting the
// browser's native cross-block-boundary backspace (a well-known source of
// DOM structure corruption in contenteditable regions — it doesn't know
// about the .rich-line convention this editor depends on). Anything else
// (backspace mid-line, or with an actual selection to delete) is left
// alone, left to the browser's normal, reliable within-a-line behavior.
function handleBackspace(event, el) {
  const selection = window.getSelection()
  if (!selection.rangeCount || !selection.isCollapsed) return
  const range = selection.getRangeAt(0)
  const line = getLineElement(range.startContainer)
  if (!line) return

  const preRange = document.createRange()
  preRange.setStart(line, 0)
  preRange.setEnd(range.startContainer, range.startOffset)
  if (preRange.toString().length > 0) return // not at the line's own start

  const prevLine = line.previousElementSibling
  if (!prevLine || !prevLine.classList.contains('rich-line')) return // first line, nothing above it

  event.preventDefault()
  if (isEmptyLine(prevLine)) prevLine.innerHTML = ''

  const joinOffset = prevLine.childNodes.length
  for (const node of Array.from(line.childNodes)) {
    if (node.nodeName === 'BR') continue
    prevLine.appendChild(node)
  }
  line.remove()
  ensureNotEmpty(prevLine)

  const newRange = document.createRange()
  const joinNode = prevLine.childNodes[joinOffset]
  if (joinNode) {
    newRange.setStart(joinNode, 0)
  } else {
    newRange.selectNodeContents(prevLine)
  }
  newRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(newRange)
}

// Wires the keyboard behavior that makes this behave like a predictable
// multi-line field (Enter, Backspace across lines, plain-text-only
// paste). Indent/Outdent/Bold key handling lives in
// lib/listFormatToolbar.js instead, alongside the toolbar buttons that do
// the same things, so the two have exactly one implementation each rather
// than two to keep in sync.
export function initRichTextField(el) {
  if (!el.hasChildNodes()) setRichTextValue(el, '')

  el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      insertLineBreak(el)
    } else if (event.key === 'Backspace') {
      handleBackspace(event, el)
    }
  })

  // Forces plain text on paste — pasting from a Word doc, a web page, or
  // another record would otherwise bring in arbitrary fonts/colors/markup
  // this editor has no model for at all (only depth + bold).
  el.addEventListener('paste', (event) => {
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  })
}
