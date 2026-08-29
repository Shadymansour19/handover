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

// `<input type="datetime-local">` needs "YYYY-MM-DDTHH:MM" in the viewer's
// local time (not UTC) — the browser interprets that value as local time
// both when reading it back out and when displaying it, so this pairs with
// `new Date(inputValue).toISOString()` to round-trip correctly through
// Postgres's timestamptz.
export function toLocalDatetimeInput(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

export function nowLocalDatetimeInput() {
  return toLocalDatetimeInput(new Date())
}
