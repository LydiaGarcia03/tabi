// Installing the app (PWA). Chrome fires `beforeinstallprompt` when it
// considers the app installable; we keep the event so a button can show its
// install dialog. If it never fires, the phone only offers a shortcut.

import { useSyncExternalStore } from 'react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallState = 'installed' | 'ready' | 'unavailable'

let promptEvent: InstallPromptEvent | null = null
let installed = window.matchMedia('(display-mode: standalone)').matches
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

// Registered at startup (imported by main.tsx): the event can fire before any page renders.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  promptEvent = event as InstallPromptEvent
  notify()
})

window.addEventListener('appinstalled', () => {
  installed = true
  promptEvent = null
  notify()
})

function getState(): InstallState {
  if (installed) return 'installed'
  return promptEvent ? 'ready' : 'unavailable'
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, getState)
}

/** Shows Chrome's install dialog (only when the state is "ready"). */
export async function installApp(): Promise<void> {
  if (!promptEvent) return
  const event = promptEvent
  promptEvent = null
  await event.prompt()
  await event.userChoice
  notify()
}
