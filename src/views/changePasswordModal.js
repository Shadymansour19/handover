import { changeOwnPassword } from '../data/users.js'
import { openModal } from '../lib/modal.js'

export function openChangePasswordModal({ email }) {
  const { modalEl, close } = openModal(`
    <h2>Change Password</h2>
    <form id="change-password-form" class="record-form">
      <label>Current password
        <input type="password" id="field-current-password" autocomplete="current-password" required />
      </label>
      <label>New password
        <input type="password" id="field-new-password" autocomplete="new-password" required minlength="6" />
      </label>
      <label>Confirm new password
        <input type="password" id="field-confirm-password" autocomplete="new-password" required minlength="6" />
      </label>
      <p id="change-password-error" class="status status--error" hidden></p>
      <p id="change-password-success" class="status status--success" hidden></p>
      <div class="modal-actions">
        <button type="button" id="change-password-cancel">Cancel</button>
        <button type="submit">Change password</button>
      </div>
    </form>
  `)

  const form = modalEl.querySelector('#change-password-form')
  const errorEl = modalEl.querySelector('#change-password-error')
  const successEl = modalEl.querySelector('#change-password-success')

  modalEl.querySelector('#change-password-cancel').addEventListener('click', close)

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    errorEl.hidden = true
    successEl.hidden = true

    const currentPassword = modalEl.querySelector('#field-current-password').value
    const newPassword = modalEl.querySelector('#field-new-password').value
    const confirmPassword = modalEl.querySelector('#field-confirm-password').value

    if (newPassword !== confirmPassword) {
      errorEl.hidden = false
      errorEl.textContent = 'New password and confirmation do not match.'
      return
    }

    const submitButton = form.querySelector('button[type="submit"]')
    submitButton.disabled = true

    try {
      await changeOwnPassword(email, currentPassword, newPassword)
      successEl.hidden = false
      successEl.textContent = 'Password changed.'
      form.reset()
    } catch (err) {
      errorEl.hidden = false
      errorEl.textContent = err.message || 'Failed to change password.'
    } finally {
      submitButton.disabled = false
    }
  })
}
