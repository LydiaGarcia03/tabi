import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { requestPersistentStorage } from './db/db'
import './install'
import { startAutoSync } from './sync/sync'
import { applyTheme } from './theme'

applyTheme()
void requestPersistentStorage()
startAutoSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
