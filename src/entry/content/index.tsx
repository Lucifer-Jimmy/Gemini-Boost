import { createRoot } from 'react-dom/client'
import { App } from './App'

const ROOT_ID = 'gs-content-root'

const ensureRoot = (): HTMLElement => {
  let root = document.getElementById(ROOT_ID)
  if (!root) {
    root = document.createElement('div')
    root.id = ROOT_ID
    root.setAttribute('data-gs-root', 'true')
    root.style.display = 'contents'
    document.body.appendChild(root)
  }
  return root
}

const root = ensureRoot()
createRoot(root).render(<App />)
