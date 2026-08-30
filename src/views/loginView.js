import { passwordFieldHTML, initPasswordToggles } from '../lib/passwordToggle.js'

export function renderLoginView(container, { onSignIn }) {
  container.innerHTML = `
    <div class="login-screen">
      <h1>Handover</h1>
      <p>Sign in with the username (or email) and password your admin gave you.</p>
      <form id="login-form" class="login-form">
        <input
          type="text"
          id="login-identifier"
          placeholder="Username or email"
          autocomplete="username"
          required
        />
        ${passwordFieldHTML(`
          <input
            type="password"
            id="login-password"
            placeholder="Password"
            autocomplete="current-password"
            required
          />
        `)}
        <button type="submit">Sign in</button>
      </form>
      <p id="login-status" class="status" hidden></p>
    </div>
  `

  initPasswordToggles(container)

  const form = container.querySelector('#login-form')
  const status = container.querySelector('#login-status')

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const identifier = container.querySelector('#login-identifier').value.trim()
    const password = container.querySelector('#login-password').value
    const button = form.querySelector('button')

    button.disabled = true
    status.hidden = false
    status.className = 'status'
    status.textContent = 'Signing in…'

    try {
      await onSignIn(identifier, password)
      // On success, the auth state change listener in main.js re-renders
      // the app — nothing further to do here.
    } catch (err) {
      status.className = 'status status--error'
      status.textContent = err.message || 'Sign-in failed. Check your username/email and password.'
    } finally {
      button.disabled = false
    }
  })
}
