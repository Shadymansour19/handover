export function renderLoginView(container, { onSignIn }) {
  container.innerHTML = `
    <div class="login-screen">
      <h1>Handover</h1>
      <p>Sign in with the email and password your admin gave you.</p>
      <form id="login-form" class="login-form">
        <input
          type="email"
          id="login-email"
          placeholder="you@company.com"
          autocomplete="email"
          required
        />
        <input
          type="password"
          id="login-password"
          placeholder="Password"
          autocomplete="current-password"
          required
        />
        <button type="submit">Sign in</button>
      </form>
      <p id="login-status" class="status" hidden></p>
    </div>
  `

  const form = container.querySelector('#login-form')
  const status = container.querySelector('#login-status')

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const email = container.querySelector('#login-email').value.trim()
    const password = container.querySelector('#login-password').value
    const button = form.querySelector('button')

    button.disabled = true
    status.hidden = false
    status.className = 'status'
    status.textContent = 'Signing in…'

    try {
      await onSignIn(email, password)
      // On success, the auth state change listener in main.js re-renders
      // the app — nothing further to do here.
    } catch (err) {
      status.className = 'status status--error'
      status.textContent = err.message || 'Sign-in failed. Check your email and password.'
    } finally {
      button.disabled = false
    }
  })
}
