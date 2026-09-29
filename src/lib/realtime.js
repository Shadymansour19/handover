import { supabase } from '../supabaseClient.js'

// Live sync: subscribes to every INSERT/UPDATE/DELETE on the given tables
// and calls onChange() — no payload passed through on purpose. Every call
// site just wants "something changed, refetch the current view," not to
// reconcile a specific row into local state; that keeps this generic
// rather than needing a different reconciliation strategy per view.
// Debounced so a burst of changes (e.g. someone editing several records
// in a row) collapses into one refetch instead of one per event.
//
// RLS still applies: postgres_changes only delivers an event for a row
// the subscribing client could currently SELECT (NEW row for INSERT/
// UPDATE, OLD row for DELETE) — see SPEC.md "live sync between users" for
// the one known consequence (a non-admin isn't notified when their own
// record is soft-deleted by someone else, since the updated row's
// deleted_at no longer satisfies their own SELECT policy).
//
// Returns an unsubscribe function — callers MUST call it when the
// subscribing view goes away (mainView.js's cleanup handed back to
// main.js, historyModal.js's onClose()), or the channel keeps listening
// and calling a callback bound to an already-discarded view forever.
export function subscribeToChanges(tables, onChange, { debounceMs = 400 } = {}) {
  let timeout = null
  function debouncedOnChange() {
    clearTimeout(timeout)
    timeout = setTimeout(onChange, debounceMs)
  }

  // Unique per call — reusing a channel name across separate subscribe()
  // calls (e.g. mainView.js remounting after a real sign-out/in) risks the
  // realtime client conflating them, so each subscription gets its own.
  const channel = supabase.channel(`db-changes-${tables.join('-')}-${crypto.randomUUID()}`)
  for (const table of tables) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, debouncedOnChange)
  }
  channel.subscribe()

  return function unsubscribe() {
    clearTimeout(timeout)
    supabase.removeChannel(channel)
  }
}
