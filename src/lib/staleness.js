// A record is "stale" when it's sat in a non-terminal status without any
// update for longer than that status's own threshold — a real
// operational/safety signal (an open permit or work order nobody's
// touched in a while) worth surfacing, not just something to notice by
// scrolling. See SPEC.md "stale-record flagging".
//
// The pre-work "permit" stages are flagged sooner (4 days) than Work in
// Progress (7 days) — an unmoving permit application is a smaller time
// commitment than an open work order, so it going quiet is a faster
// signal something's wrong. Terminal statuses (Work is Done/Job
// Canceled/Job Held) and "Other" (a free-text catch-all with no implied
// timeline) are never flagged — there's no "stale" concept for either.
const STALE_THRESHOLD_DAYS = {
  'Permit Prepared': 4,
  'Permit Submitted': 4,
  'Permit Discussed': 4,
  'Permit Ready to Open': 4,
  'Work in Progress': 7,
}

// Returns the number of whole days since this record's last update if
// it's past its status's threshold, or null if it isn't stale (including
// if its status has no threshold at all).
export function staleDays(record) {
  const thresholdDays = STALE_THRESHOLD_DAYS[record.work_status]
  if (thresholdDays === undefined) return null

  const daysSinceUpdate = (Date.now() - new Date(record.updated_at).getTime()) / (24 * 60 * 60 * 1000)
  if (daysSinceUpdate < thresholdDays) return null

  return Math.floor(daysSinceUpdate)
}
