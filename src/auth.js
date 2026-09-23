import { supabase } from './supabaseClient.js'
import { resolveLoginEmail } from './data/profiles.js'

export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

export function onAuthStateChange(callback) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    // Only a real sign-in/sign-out should trigger main.js's render()
    // (which wipes and remounts #app from scratch) — Supabase also fires
    // this on TOKEN_REFRESHED (routinely, and notably the moment a
    // backgrounded browser tab regains focus) and a few other events
    // that don't mean the signed-in user changed (USER_UPDATED,
    // INITIAL_SESSION, ...). Reacting to those was the cause of a real
    // bug: open "+ New Record", alt-tab away and back, and the token
    // refresh's remount would silently replace the main view underneath
    // — the modal itself survives (it's appended to document.body, not
    // #app) and the save still succeeds, but its onSaved/reload() closure
    // was bound to the now-discarded old view, so the visible (new) view
    // never reflects the new record until a manual page refresh.
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') callback(session)
  })
  return () => subscription.unsubscribe()
}

// Email/username + password sign-in (see SPEC.md "2026-08-29 — auth
// pivot"). Accounts are admin-created only (public sign-up disabled) —
// there is no sign-up call here on purpose. Supabase Auth itself only
// accepts an email, so a typed username is resolved to one first.
export async function signIn(identifier, password) {
  const email = await resolveLoginEmail(identifier)
  if (!email) throw new Error('Invalid email/username or password.')

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
