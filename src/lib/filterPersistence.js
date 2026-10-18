// Remembers the main view's filter (date range, search, "show deleted")
// and which of Maintenance/Operations is showing, across a page refresh —
// see SPEC.md "filter persists across refresh". Plain localStorage, not
// per-user: this is "what this browser was last looking at," the same
// category of thing as a scroll position, not account state (that's
// Supabase Auth's own session storage, untouched here).
const STORAGE_KEY = 'handover-filter'

function isValidDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

// Returns null for anything missing/malformed — covers both "never saved
// before" and "saved by an older version of this app with a different
// shape," so a future change here never needs its own migration path,
// just a reason to fall back to the normal defaults (getDefaultRange(),
// empty search, etc.) exactly as if nothing had been saved at all.
export function loadSavedFilter() {
  let parsed
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (
    !parsed ||
    !isValidDateString(parsed.from) ||
    !isValidDateString(parsed.to) ||
    typeof parsed.search !== 'string' ||
    typeof parsed.includeDeleted !== 'boolean' ||
    (parsed.view !== 'maintenance' && parsed.view !== 'operation')
  ) {
    return null
  }

  return parsed
}

export function saveFilter({ from, to, search, includeDeleted, view }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ from, to, search, includeDeleted, view }))
  } catch {
    // Private browsing / storage disabled / quota — the filter just won't
    // survive a refresh this time, which is exactly what happens today
    // without this feature at all, so failing silently is the right
    // fallback rather than surfacing an error for a nicety like this.
  }
}
