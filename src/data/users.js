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

// supabase-js only sets a generic "Edge Function returned a non-2xx status
// code" on error.message for an HTTP-level failure — the actual reason (the
// JSON body admin-manage-users/index.ts sends back) is only reachable via
// error.context, the raw Response object, which it leaves to the caller to
// read. Without this, every failure looks identical and unhelpful.
async function invokeAdminUsersFunction(body) {
  const { data, error } = await supabase.functions.invoke('admin-manage-users', { body })

  if (error) {
    let message = error.message
    try {
      const errorBody = await error.context?.json?.()
      if (errorBody?.error) message = errorBody.error
    } catch {
      // Response body wasn't JSON (or already consumed) — fall back to the
      // generic message rather than letting this throw instead.
    }
    throw new Error(message)
  }

  if (data?.error) throw new Error(data.error)
  return data
}

// All three of these call the admin-manage-users Edge Function — see that
// file's header comment for why they can't be plain client calls (account
// creation, setting someone else's password, and deleting an account all
// require the service_role key).
export async function createUser({ email, password, username, role, fullName }) {
  return invokeAdminUsersFunction({ action: 'create', email, password, username, role, fullName })
}

export async function setUserPassword(userId, password) {
  return invokeAdminUsersFunction({ action: 'set-password', userId, password })
}

// Hard delete — permanently removes the auth account (profiles cascades).
// Fails with a foreign-key error if this user has ever created a
// maintenance record or operation event (deliberate — see the Edge
// Function's comment); such a user needs deactivating instead of deleting.
export async function deleteUser(userId) {
  return invokeAdminUsersFunction({ action: 'delete', userId })
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
