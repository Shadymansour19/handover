// Parses `**bold**` markers (lib/listFormatToolbar.js's Bold button) out
// of one line's text into a flat list of `{ text, bold }` segments —
// shared parsing, one rendering step per target: lib/bullets.js (the web
// View modal) turns a segment into `<strong>`/escaped text,
// docxExport.js into a bold/plain `TextRun`, pdfExport.js into a
// bold/plain pdfmake inline run. Same split as lib/combinedTimeline.js
// (shared data merging, per-target rendering) for a different kind of
// shared step.
//
// Markdown-style, not real Markdown — this only ever recognizes `**...**`,
// nothing else (no italics, headings, links). A line with no markers at
// all (the common case) comes back as a single non-bold segment, so a
// caller doesn't need its own fast path for "there's no formatting here."
const BOLD_PATTERN = /\*\*(.+?)\*\*/g

export function parseInlineBold(text) {
  const segments = []
  let lastIndex = 0
  let match

  BOLD_PATTERN.lastIndex = 0
  while ((match = BOLD_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), bold: false })
    }
    segments.push({ text: match[1], bold: true })
    lastIndex = BOLD_PATTERN.lastIndex
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bold: false })
  }

  // Covers both "empty string" and "no markers matched at all" — always
  // at least one segment, so callers can map/join unconditionally.
  if (segments.length === 0) {
    segments.push({ text, bold: false })
  }

  return segments
}
