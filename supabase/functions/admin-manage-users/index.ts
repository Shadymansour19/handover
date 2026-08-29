// Handles the two admin user-management actions that genuinely require the
// service_role key — creating an account, and setting a DIFFERENT user's
// password — neither of which the anon-key client can ever do (nor should
// it; service_role bypasses RLS entirely and must never reach the browser).
// Everything else (viewing users, editing role/username/is_active) goes
// through plain RLS-governed calls from the client instead — see
// 20260830100000_admin_manage_users.sql. A user changing their OWN password
// also doesn't need this: supabase.auth.updateUser() works directly with
// their own session, no service_role involved.
//
// Deploy with the Supabase CLI (this repo's GitHub integration deploys
// migrations automatically, but not Edge Functions):
//   npx supabase login
//   npx supabase link --project-ref pfkpvkaybylrdnfwycxn
//   npx supabase functions deploy admin-manage-users
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected
// automatically by the Edge Function runtime — nothing to configure.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4'

// The deployed function lives on a different origin than the static
// frontend, so every response (including the browser's OPTIONS preflight)
// needs these — without them the browser blocks the response outright
// before any application code here even sees it.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401)
    }

    // Scoped to the CALLER's own session — used only to verify who's
    // calling and that they're an admin. Never used to perform the actual
    // privileged action.
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const {
      data: { user: callerUser },
      error: callerError,
    } = await callerClient.auth.getUser()
    if (callerError || !callerUser) {
      return jsonResponse({ error: 'Not authenticated' }, 401)
    }

    const { data: isAdmin, error: adminCheckError } = await callerClient.rpc('is_admin')
    if (adminCheckError || !isAdmin) {
      return jsonResponse({ error: 'Only an admin can manage users' }, 403)
    }

    const body = await req.json()

    // The one and only place the service_role key is used — never sent to
    // the browser, only held here inside the function's own runtime.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    if (body.action === 'create') {
      const { email, password, username, role, fullName } = body
      if (!email || !password || !username) {
        return jsonResponse({ error: 'email, password, and username are required' }, 400)
      }
      if (role && role !== 'user' && role !== 'admin') {
        return jsonResponse({ error: 'role must be "user" or "admin"' }, 400)
      }

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // admin-created accounts skip the confirmation email
      })
      if (createError) {
        return jsonResponse({ error: createError.message }, 400)
      }

      // The on_auth_user_created trigger already inserted a default
      // profiles row (role='user', username = email prefix) — this fixes
      // it up to what the admin actually asked for. Runs as service_role,
      // so it bypasses profiles_update's is_admin() check entirely — fine,
      // since admin status was already verified above before reaching here.
      const { error: profileError } = await adminClient
        .from('profiles')
        .update({ username, role: role ?? 'user', full_name: fullName ?? null })
        .eq('id', created.user.id)
      if (profileError) {
        return jsonResponse({ error: profileError.message }, 400)
      }

      return jsonResponse({ id: created.user.id }, 200)
    }

    if (body.action === 'set-password') {
      const { userId, password } = body
      if (!userId || !password) {
        return jsonResponse({ error: 'userId and password are required' }, 400)
      }

      const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
        password,
      })
      if (updateError) {
        return jsonResponse({ error: updateError.message }, 400)
      }

      return jsonResponse({ ok: true }, 200)
    }

    if (body.action === 'delete') {
      const { userId } = body
      if (!userId) {
        return jsonResponse({ error: 'userId is required' }, 400)
      }
      if (userId === callerUser.id) {
        return jsonResponse({ error: "You can't delete your own account." }, 400)
      }

      // profiles.id -> auth.users(id) is ON DELETE CASCADE, so the profile
      // row cleans up automatically. maintenance_records.created_by and
      // operation_events.created_by are NOT cascading (plain REFERENCES,
      // no ON DELETE clause) — deleting a user who has ever created a
      // record fails with a foreign key error, which surfaces here as-is
      // rather than a friendlier message. That's deliberate for now: it's
      // a safety net (can't silently orphan/erase someone's audit trail by
      // deleting their account), not a bug — such a user would need to be
      // deactivated instead of deleted.
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
      if (deleteError) {
        return jsonResponse({ error: deleteError.message }, 400)
      }

      return jsonResponse({ ok: true }, 200)
    }

    return jsonResponse({ error: `Unknown action: ${body.action}` }, 400)
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
