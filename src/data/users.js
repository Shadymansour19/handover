import { supabase } from '../supabaseClient.js'

// Admin-only (list_users() checks this itself — see
// 20260830100000_admin_manage_users.sql — a non-admin just gets an empty
// array back, not an error).
export async function fetchUsers() {
  const { data, error } = await supabase.rpc('list_users')
  if (error) throw error
  return data
}

// Plain RLS-governed update — profiles_update allows this for admins only.
// Used for username/full_name/role/is_active; never for setting a
// password, which profiles doesn't (and can't) store.
export async function updateProfile(id, fields) {
  const { data, error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', id)
    .select('id, username, full_name, role, is_active')
    .single()

  if (error) throw error
  return data
}

// Both of these call the admin-manage-users Edge Function — see that
// file's header comment for why they can't be plain client calls
// (creating an account / setting someone else's password both require the
// service_role key).
export async function createUser({ email, password, username, role, fullName }) {
  const { data, error } = await supabase.functions.invoke('admin-manage-users', {
    body: { action: 'create', email, password, username, role, fullName },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function setUserPassword(userId, password) {
  const { data, error } = await supabase.functions.invoke('admin-manage-users', {
    body: { action: 'set-password', userId, password },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

// A user changing their OWN password — no service_role/Edge Function
// needed, since Supabase Auth lets an authenticated session set its own
// password directly. Re-verifies the CURRENT password first via a fresh
// sign-in, as a safety check updateUser() doesn't do on its own (it would
// otherwise let anyone with an unlocked/hijacked session change the
// password without knowing it, locking the real owner out).
export async function changeOwnPassword(email, currentPassword, newPassword) {
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  })
  if (reauthError) throw new Error('Current password is incorrect.')

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}
