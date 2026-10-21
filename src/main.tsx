import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { requestPersistentStorage } from './db/db'
import { applyTheme } from './theme'

applyTheme()
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
