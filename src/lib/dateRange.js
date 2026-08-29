const DAY_MS = 24 * 60 * 60 * 1000

// Local-time date (not UTC) so "today" matches the viewer's device, per the
// timezone assumption documented in SPEC.md.
export function toISODate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayISO() {
  return toISODate(new Date())
}

// Default filter: last 7 days inclusive of today.
export function getDefaultRange() {
  const today = new Date()
  const from = new Date(today.getTime() - 6 * DAY_MS)
  return { from: toISODate(from), to: toISODate(today) }
}
