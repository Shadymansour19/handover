export function renderLoginView(container, { onRequestMagicLink }) {
  container.innerHTML = `
    <div class="login-screen">
      <h1>Handover</h1>
      <p>Sign in with a magic link sent to your work email.</p>
      <form id="login-form" class="login-form">
        <input
          type="email"
          id="login-email"
          placeholder="you@company.com"
          autocomplete="email"
          required
        />
        <button type="submit">Send magic link</button>
      </form>
      <p id="login-status" class="status" hidden></p>
    </div>
  `

  const form = container.querySelector('#login-form')
  const status = container.querySelector('#login-status')

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const email = container.querySelector('#login-email').value.trim()
    const button = form.querySelector('button')

    button.disabled = true
    status.hidden = false
    status.className = 'status'
    status.textContent = 'Sending…'

    try {
      await onRequestMagicLink(email)
      status.className = 'status status--success'
      status.textContent = `Check ${email} for a sign-in link.`
    } catch (err) {
      status.className = 'status status--error'
      status.textContent = err.message || 'Something went wrong. Try again.'
    } finally {
      button.disabled = false
    }
  })
}
