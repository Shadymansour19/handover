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
  } = supabase.auth.onAuthStateChange((_event, session) => callback(session))
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
