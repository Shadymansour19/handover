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

// Preset buttons in filterModal.js — same "inclusive of today" convention
// as getDefaultRange() above.
export function getLast30DaysRange() {
  const today = new Date()
  const from = new Date(today.getTime() - 29 * DAY_MS)
  return { from: toISODate(from), to: toISODate(today) }
}

export function getThisMonthRange() {
  const today = new Date()
  const from = new Date(today.getFullYear(), today.getMonth(), 1)
  return { from: toISODate(from), to: toISODate(today) }
}

// Monday-Sunday (ISO week), not the last 7 days from today — the point of
// this preset is "the calendar week before this one," distinct from
// getDefaultRange()'s rolling last-7-days.
export function getPreviousWeekRange() {
  const today = new Date()
  const day = today.getDay() // 0 = Sunday, ..., 6 = Saturday
  const daysSinceMonday = day === 0 ? 6 : day - 1
  const thisMonday = new Date(today.getTime() - daysSinceMonday * DAY_MS)
  const prevMonday = new Date(thisMonday.getTime() - 7 * DAY_MS)
  const prevSunday = new Date(thisMonday.getTime() - DAY_MS)
  return { from: toISODate(prevMonday), to: toISODate(prevSunday) }
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
