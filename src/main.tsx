import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { requestPersistentStorage } from './db/db'
import { repairOptionLinks } from './db/options'
import './install'
import { startAutoSync } from './sync/sync'
import { applyTheme } from './theme'

applyTheme()
void requestPersistentStorage()
// Options ticked for places deleted before 1.11.8: relinked or unticked (see repairOptionLinks).
void repairOptionLinks().catch(() => {})
startAutoSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
