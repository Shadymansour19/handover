// Applied on submit (recordModal.js, operationEventModal.js), not as the
// user types — SPEC.md "title/sentence case on submit".

// Standard "minor words stay lowercase unless first/last" English title
// case list — not exhaustive, but covers the common short
// articles/conjunctions/prepositions a title would otherwise read oddly
// with capitalized ("Housekeeping Inside The Enclosure" vs "...the...").
const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into',
  'nor', 'of', 'on', 'onto', 'or', 'over', 'per', 'so', 'the', 'to', 'up',
  'via', 'with', 'yet',
])

function capitalizeWord(word) {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

// Record title (work_scope) — every word capitalized except the small
// words above, which stay lowercase UNLESS they're the first or last word
// (e.g. "Filter House Cleaning Using Chemicals", but "Of Pumps And Valves"
// still capitalizes the leading "Of"). Splits on whitespace runs, keeping
// the original whitespace, so multiple spaces/tabs survive unchanged.
export function toTitleCase(text) {
  const segments = (text ?? '').split(/(\s+)/)
  const wordIndices = segments.reduce((acc, seg, i) => {
    if (seg.trim() !== '') acc.push(i)
    return acc
  }, [])
  const firstIdx = wordIndices[0]
  const lastIdx = wordIndices[wordIndices.length - 1]

  return segments
    .map((segment, i) => {
      if (segment.trim() === '') return segment
      const lower = segment.toLowerCase()
      const isEdge = i === firstIdx || i === lastIdx
      if (SMALL_WORDS.has(lower) && !isEdge) return lower
      return capitalizeWord(lower)
    })
    .join('')
}

// Multi-line fields (detailed_steps, comment, pending) — capitalizes the
// first letter of each non-empty line (each line is its own point/bullet,
// see lib/bullets.js), preserving any leading indentation (tabs) added by
// the formatting toolbar.
export function capitalizeLines(text) {
  return (text ?? '')
    .split('\n')
    .map((line) => {
      const leadingWhitespace = line.match(/^[\t ]*/)[0]
      const rest = line.slice(leadingWhitespace.length)
      if (!rest) return line
      return leadingWhitespace + capitalizeWord(rest)
    })
    .join('\n')
}
