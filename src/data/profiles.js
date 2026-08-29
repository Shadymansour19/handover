import { supabase } from '../supabaseClient.js'

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
