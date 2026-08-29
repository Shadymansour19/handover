import { supabase } from '../supabaseClient.js'

// Resolves a login identifier that may be a username to the email
// signInWithPassword actually needs. Passes emails through unchanged (no
// RPC round-trip needed) so this only costs a lookup for username logins.
export async function resolveLoginEmail(identifier) {
  if (identifier.includes('@')) return identifier

  const { data, error } = await supabase.rpc('lookup_email_by_username', {
    p_username: identifier,
  })
  if (error) throw error
  // null just means "no such username" — the caller treats this the same
  // as any other invalid-credentials case, so no distinct error here.
  return data
}

// The signed-in user's own profile (username, role) — created automatically
// by the on_auth_user_created trigger the moment an admin adds their
// account, so this should always find a row.
export async function fetchOwnProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, role')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data
}
