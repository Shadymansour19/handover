// A small, persistent "Update available" banner — shown when the service
// worker has detected a new deploy and already activated in the
// background (registerType: 'autoUpdate' in vite.config.js), but the
// already-loaded page is still running the OLD JS bundle. This is the
// deliberate alternative to vite-plugin-pwa's own default behavior for
// that moment, which is a completely silent `window.location.reload()` —
// fine for most apps, but risky here: a facility worker mid-way through
// filling in a maintenance record shouldn't lose that input to a reload
// they never saw coming. Showing this instead, and letting them pick the
// moment to refresh, trades "always fresh instantly" for "never loses
// work in progress" — the right trade for a form-heavy app.
export function showUpdateBanner() {
  if (document.querySelector('.sw-update-banner')) return

  const banner = document.createElement('div')
  banner.className = 'sw-update-banner'
  banner.innerHTML = `
    <span>A new version is available.</span>
    <button type="button" id="sw-update-refresh">Refresh</button>
  `
  document.body.appendChild(banner)

  banner.querySelector('#sw-update-refresh').addEventListener('click', () => {
    window.location.reload()
  })
}
