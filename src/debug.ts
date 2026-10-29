// Development only (`npm run dev`): tools that help test the app, each turned on in Settings → Debug features,
// then opened from a button in the top bar. Never in the published build (import.meta.env.DEV is false there).

import { useSyncExternalStore } from 'react'
import type { IconName } from './iconPaths'
import { loadJson, saveJson } from './settings'

export const DEBUG_AVAILABLE = import.meta.env.DEV

export type DebugFeature = 'fakeGps' | 'apiUsage'

export const DEBUG_FEATURES: { id: DebugFeature; label: string; icon: IconName; description: string }[] = [
  {
    id: 'fakeGps',
    label: 'Fake GPS',
    icon: 'locate',
    description: 'A made-up position and compass for the Logbook, for a PC whose location is off.',
  },
  {
    id: 'apiUsage',
    label: 'API usage',
    icon: 'pie',
    description: "Requests used this month: Google Cloud (Maps, Places, Routes) and NAVITIME's 500.",
  },
]

const KEY = 'tabi.debug'
let flags: Partial<Record<DebugFeature, boolean>> = (DEBUG_AVAILABLE && loadJson<Partial<Record<DebugFeature, boolean>>>(KEY)) || {}
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setDebugFeature(id: DebugFeature, on: boolean): void {
  flags = { ...flags, [id]: on }
  saveJson(KEY, flags)
  listeners.forEach((l) => l())
}

/** The features turned on (none outside `npm run dev`). */
export function useDebugFeatures(): Partial<Record<DebugFeature, boolean>> {
  const current = useSyncExternalStore(subscribe, () => flags)
  return DEBUG_AVAILABLE ? current : {}
}
