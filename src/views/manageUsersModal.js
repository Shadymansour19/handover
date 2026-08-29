import { fetchUsers, updateProfile, createUser, setUserPassword, deleteUser } from '../data/users.js'
import { escapeHTML } from '../lib/html.js'
import { openModal } from '../lib/modal.js'

// Admin-only screen: list every user (list_users() RPC — checks admin
// status itself), create a new one, edit role/username/full name/active
// status, set someone's password, or permanently delete their account.
// Creating a user, setting someone ELSE's password, and deleting a user all
// go through the admin-manage-users Edge Function (need the service_role
// key); everything else is a plain RLS-governed update (profiles_update,
// admin-only).
//
// Self-protection: an admin can't demote or deactivate their OWN account
// here — tested directly against the database that doing so instantly
// locks the caller out of every table (is_allowed_user()/is_admin() both
// check the CALLER's own profile), which is correct behavior for
// deactivation in general but a nasty footgun to allow on yourself by
// accident.
export async function openManageUsersModal({ currentUserId }) {
  const { modalEl, close, onClose } = openModal(
    `
    <h2>Manage Users</h2>
    <div class="toolbar">
      <button type="button" id="add-user">+ Add user</button>
    </div>
    <div id="users-content"><p class="loading">Loading…</p></div>
    <div class="modal-actions">
      <button type="button" id="users-close">Close</button>
    </div>
  `,
    { wide: true }
  )

  modalEl.querySelector('#users-close').addEventListener('click', close)
  modalEl.querySelector('#add-user').addEventListener('click', () => {
    openCreateUserModal({ onSaved: load })
  })

  const content = modalEl.querySelector('#users-content')
  let currentUsers = []

  function renderUsersTable(users) {
    if (users.length === 0) {
      return '<p class="empty">No users found.</p>'
    }

    const rows = users
      .map((user) => {
        const isSelf = user.id === currentUserId
        return `
          <tr>
            <td>${escapeHTML(user.username)}${isSelf ? ' <span class="hint">(you)</span>' : ''}</td>
            <td>${escapeHTML(user.full_name ?? '—')}</td>
            <td>${escapeHTML(user.email)}</td>
            <td>${escapeHTML(user.role)}</td>
            <td>${user.is_active ? 'Active' : 'Inactive'}</td>
            <td class="actions">
              <div class="row-menu">
                <button type="button" class="row-menu__trigger" data-action="toggle-menu"
                        data-user-id="${user.id}" aria-label="Actions" aria-haspopup="true">⋮</button>
                <div class="row-menu__dropdown" hidden>
                  <button data-action="edit" data-user-id="${user.id}">Edit</button>
                  <button data-action="set-password" data-user-id="${user.id}">Set password</button>
                  <button data-action="delete" data-user-id="${user.id}"
                          ${isSelf ? 'disabled title="You can\'t delete your own account"' : ''}>Delete</button>
                </div>
              </div>
            </td>
          </tr>
        `
      })
      .join('')

    return `
      <table class="records-table users-table">
        <colgroup>
          <col class="col-users-username" />
          <col class="col-users-fullname" />
          <col class="col-users-email" />
          <col class="col-users-role" />
          <col class="col-users-status" />
          <col class="col-users-actions" />
        </colgroup>
        <thead>
          <tr><th>Username</th><th>Full name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `
  }

  async function load() {
    content.innerHTML = '<p class="loading">Loading…</p>'
    try {
      currentUsers = await fetchUsers()
      content.innerHTML = renderUsersTable(currentUsers)
    } catch (err) {
      currentUsers = []
      content.innerHTML = `<p class="error">Failed to load users: ${escapeHTML(
        err.message || String(err)
      )}</p>`
    }
  }

  function closeAllMenus() {
    content.querySelectorAll('.row-menu__dropdown').forEach((el) => {
      el.hidden = true
    })
  }

  // Same pattern as historyModal.js — see that file for why this needs the
  // onClose() cleanup hook rather than just adding a bare listener.
  function handleOutsideClick(event) {
    if (!content.contains(event.target)) closeAllMenus()
  }
  document.addEventListener('click', handleOutsideClick)
  onClose(() => document.removeEventListener('click', handleOutsideClick))

  content.addEventListener('click', (event) => {
    const trigger = event.target.closest('button[data-action="toggle-menu"]')
    if (trigger) {
      const dropdown = trigger.nextElementSibling
      const wasOpen = !dropdown.hidden
      closeAllMenus()
      dropdown.hidden = wasOpen
      return
    }

    closeAllMenus()

    const button = event.target.closest('button[data-action]')
    if (!button) return

    const user = currentUsers.find((u) => u.id === button.dataset.userId)
    if (!user) return

    if (button.dataset.action === 'edit') {
      openEditUserModal({ user, isSelf: user.id === currentUserId, onSaved: load })
    } else if (button.dataset.action === 'set-password') {
      openSetPasswordModal({ user })
    } else if (button.dataset.action === 'delete') {
      handleDeleteUser(user)
    }
  })

  async function handleDeleteUser(user) {
    if (
      !window.confirm(
        `Permanently delete "${user.username}" (${user.email})? This cannot be undone. If they've ever created a maintenance record or operation event, this will fail — deactivate them instead of deleting in that case.`
      )
    ) {
      return
    }
    try {
      await deleteUser(user.id)
      load()
    } catch (err) {
      window.alert(err.message || 'Failed to delete user.')
    }
  }

  await load()
}

function openCreateUserModal({ onSaved }) {
  const { modalEl, close } = openModal(`
    <h2>Add User</h2>
    <form id="create-user-form" class="record-form">
      <label>Email
        <input type="email" id="field-email" required />
      </label>
      <label>Password
        <input type="password" id="field-password" required minlength="6" />
      </label>
      <label>Username
        <input type="text" id="field-username" required />
      </label>
      <label>Full name
        <input type="text" id="field-full-name" />
      </label>
      <label>Role
        <select id="field-role">
          <option value="user" selected>user</option>
          <option value="admin">admin</option>
        </select>
      </label>
      <p id="create-user-error" class="status status--error" hidden></p>
      <div class="modal-actions">
        <button type="button" id="create-user-cancel">Cancel</button>
        <button type="submit">Create user</button>
      </div>
    </form>
  `)

  modalEl.querySelector('#create-user-cancel').addEventListener('click', close)

  const form = modalEl.querySelector('#create-user-form')
  const errorEl = modalEl.querySelector('#create-user-error')

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    errorEl.hidden = true

    const email = modalEl.querySelector('#field-email').value.trim()
    const password = modalEl.querySelector('#field-password').value
    const username = modalEl.querySelector('#field-username').value.trim()
    const fullName = modalEl.querySelector('#field-full-name').value.trim()
    const role = modalEl.querySelector('#field-role').value

    const submitButton = form.querySelector('button[type="submit"]')
    submitButton.disabled = true

    try {
      await createUser({ email, password, username, role, fullName: fullName || null })
      close()
      onSaved?.()
    } catch (err) {
      errorEl.hidden = false
      errorEl.textContent = err.message || 'Failed to create user.'
      submitButton.disabled = false
    }
  })
}

function openEditUserModal({ user, isSelf, onSaved }) {
  const roleOptions = ['user', 'admin']
    .map((role) => `<option value="${role}" ${role === user.role ? 'selected' : ''}>${role}</option>`)
    .join('')

  const selfLockNote = isSelf
    ? '<p class="hint">You can\'t change your own role or active status here — ask another admin. Use "Change Password" (in the header) for your own password.</p>'
    : ''

  const { modalEl, close } = openModal(`
    <h2>Edit User — ${escapeHTML(user.username)}</h2>
    <form id="edit-user-form" class="record-form">
      <label>Username
        <input type="text" id="field-username" value="${escapeHTML(user.username)}" required />
      </label>
      <label>Full name
        <input type="text" id="field-full-name" value="${escapeHTML(user.full_name ?? '')}" />
      </label>
      <label>Role
        <select id="field-role" ${isSelf ? 'disabled' : ''}>${roleOptions}</select>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" id="field-is-active" ${user.is_active ? 'checked' : ''} ${isSelf ? 'disabled' : ''} />
        Active
      </label>
      ${selfLockNote}
      <p id="edit-user-error" class="status status--error" hidden></p>
      <div class="modal-actions">
        <button type="button" id="edit-user-cancel">Cancel</button>
        <button type="submit">Save changes</button>
      </div>
    </form>
  `)

  modalEl.querySelector('#edit-user-cancel').addEventListener('click', close)

  const form = modalEl.querySelector('#edit-user-form')
  const errorEl = modalEl.querySelector('#edit-user-error')

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    errorEl.hidden = true

    const fields = {
      username: modalEl.querySelector('#field-username').value.trim(),
      full_name: modalEl.querySelector('#field-full-name').value.trim() || null,
    }
    if (!isSelf) {
      fields.role = modalEl.querySelector('#field-role').value
      fields.is_active = modalEl.querySelector('#field-is-active').checked
    }

    const submitButton = form.querySelector('button[type="submit"]')
    submitButton.disabled = true

    try {
      await updateProfile(user.id, fields)
      close()
      onSaved?.()
    } catch (err) {
      errorEl.hidden = false
      errorEl.textContent = err.message || 'Failed to save changes.'
      submitButton.disabled = false
    }
  })
}

function openSetPasswordModal({ user }) {
  const { modalEl, close } = openModal(`
    <h2>Set Password — ${escapeHTML(user.username)}</h2>
    <form id="set-password-form" class="record-form">
      <label>New password
        <input type="password" id="field-password" required minlength="6" />
      </label>
      <label>Confirm new password
        <input type="password" id="field-confirm-password" required minlength="6" />
      </label>
      <p id="set-password-error" class="status status--error" hidden></p>
      <p id="set-password-success" class="status status--success" hidden></p>
      <div class="modal-actions">
        <button type="button" id="set-password-cancel">Cancel</button>
        <button type="submit">Set password</button>
      </div>
    </form>
  `)

  modalEl.querySelector('#set-password-cancel').addEventListener('click', close)

  const form = modalEl.querySelector('#set-password-form')
  const errorEl = modalEl.querySelector('#set-password-error')
  const successEl = modalEl.querySelector('#set-password-success')

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    errorEl.hidden = true
    successEl.hidden = true

    const password = modalEl.querySelector('#field-password').value
    const confirmPassword = modalEl.querySelector('#field-confirm-password').value

    if (password !== confirmPassword) {
      errorEl.hidden = false
      errorEl.textContent = 'Passwords do not match.'
      return
    }

    const submitButton = form.querySelector('button[type="submit"]')
    submitButton.disabled = true

    try {
      await setUserPassword(user.id, password)
      successEl.hidden = false
      successEl.textContent = 'Password set.'
      form.reset()
    } catch (err) {
      errorEl.hidden = false
      errorEl.textContent = err.message || 'Failed to set password.'
    } finally {
      submitButton.disabled = false
    }
  })
}
