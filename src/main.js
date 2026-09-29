import './styles/main.css'
import { getSession, onAuthStateChange, signIn, signOut } from './auth.js'
import { renderLoginView } from './views/loginView.js'
import { renderMainView } from './views/mainView.js'

const app = document.querySelector('#app')

// renderMainView() sets up a live-sync subscription (lib/realtime.js) and
// hands back an unsubscribe function once mounted — must be called before
// tearing down that view (a real sign-in/out only; auth.js already
// filters out every other Supabase auth event), or the old subscription
// keeps calling reload() against a recordsContainer that's no longer on
// the page. renderLoginView has nothing to clean up.
let cleanupCurrentView = null

function render(session) {
  cleanupCurrentView?.()
  cleanupCurrentView = null

  app.innerHTML = ''
  if (!session) {
    renderLoginView(app, { onSignIn: signIn })
  } else {
    renderMainView(app, { session, onSignOut: signOut }).then((cleanup) => {
      cleanupCurrentView = cleanup
    })
  }
}

const initialSession = await getSession()
render(initialSession)

onAuthStateChange((session) => render(session))
