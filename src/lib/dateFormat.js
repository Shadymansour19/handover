// One consistent display format everywhere in the app: dd-mm-yyyy (and
// dd-mm-yyyy HH:mm for timestamps that carry a time-of-day). This is
// display-only — <input type="date">/<input type="datetime-local"> values
// still have to be yyyy-mm-dd / yyyy-mm-ddTHH:mm internally (a browser
// requirement, see lib/dateRange.js), so this never touches those.
const pad = (n) => String(n).padStart(2, '0')

// "2026-08-29" -> "29-08-2026". Plain string split, not Date parsing — a
// date-only value has no time-of-day/timezone to get wrong this way.
export function formatDateDMY(dateStr) {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-')
  return `${day}-${month}-${year}`
}

// Any timestamp (ISO string or Date) -> "29-08-2026 14:05", in the
// viewer's local time.
export function formatDateTimeDMY(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  return (
    `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}
