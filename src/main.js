import './styles/main.css'
import { getSession, onAuthStateChange, requestMagicLink, signOut } from './auth.js'
import { renderLoginView } from './views/loginView.js'
import { renderMainView } from './views/mainView.js'

const app = document.querySelector('#app')

function render(session) {
  app.innerHTML = ''
  if (!session) {
    renderLoginView(app, { onRequestMagicLink: requestMagicLink })
  } else {
    renderMainView(app, { session, onSignOut: signOut })
  }
}

const initialSession = await getSession()
render(initialSession)

onAuthStateChange((session) => render(session))
