import { supabase } from './supabaseClient.js'

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

// Magic-link sign-in. Whether the email is actually allowlisted is enforced
// server-side (Auth sign-ups disabled + allowed_users/RLS, see schema.sql) —
// this call succeeds either way; a non-allowlisted user just gets no data
// once (if ever) they sign in.
export async function requestMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
