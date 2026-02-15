import { createRoot } from 'react-dom/client'
import { PopupApp } from './entry/popup/PopupApp'

const root = document.getElementById('root')

if (root) {
  createRoot(root).render(<PopupApp />)
}
