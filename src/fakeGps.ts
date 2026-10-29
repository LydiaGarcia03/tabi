// Development only (`npm run dev`): a made-up GPS position and compass heading, to test the Logbook on a PC
// whose location is turned off. Never in the published build (import.meta.env.DEV is false there).

import { loadJson, saveJson } from './settings'

export const FAKE_GPS_AVAILABLE = import.meta.env.DEV

export interface FakeGps {
  on: boolean
  lat: number
  lng: number
  /** GPS precision to pretend, in metres. */
  accuracy: number
  /** Where the top of the screen points (degrees from north); null = no compass, like a PC. */
  heading: number | null
  /** When it was last "measured" (refreshed while the panel is open, so it never looks stale). */
  time: number
}

const KEY = 'tabi.fakeGps'
let state: FakeGps | null = FAKE_GPS_AVAILABLE ? loadJson<FakeGps>(KEY) : null
const listeners = new Set<() => void>()

export function getFakeGps(): FakeGps | null {
  return state
}

export function setFakeGps(next: FakeGps): void {
  state = next
  saveJson(KEY, next)
  listeners.forEach((l) => l())
}

export function subscribeFakeGps(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Moves a point by metres north (negative = south) and east (negative = west). */
export function moveBy(p: { lat: number; lng: number }, north: number, east: number): { lat: number; lng: number } {
  const metresPerDegree = 111_320
  return { lat: p.lat + north / metresPerDegree, lng: p.lng + east / (metresPerDegree * Math.cos((p.lat * Math.PI) / 180)) }
}
