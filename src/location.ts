// The phone's position (GPS works without internet) and keeping the screen
// on while it is followed. Only while the app is open: a web app can't follow
// the position in the background.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useDebugFeatures } from './debug'
import { getFakeGps, subscribeFakeGps, type FakeGps } from './fakeGps'
import type { LatLng } from './routing/types'

export interface Position extends LatLng {
  /** Radius of uncertainty, in metres. */
  accuracy: number
  /** When it was measured (ms since epoch). */
  time: number
}

const ERROR_TEXT: Record<number, string> = {
  1: 'Location permission was denied. Allow it for this site in Chrome (lock icon → Permissions → Location).',
  2: "Your position isn't available right now (no GPS signal?).",
  3: 'Getting your position is taking too long. Still trying…',
}

/** The fake GPS of `npm run dev` when it is turned on in Debug features and in its panel (see fakeGps.ts), else null. */
function useFakeGps(): FakeGps | null {
  const fake = useSyncExternalStore(subscribeFakeGps, getFakeGps)
  return useDebugFeatures().fakeGps && fake?.on ? fake : null
}

/** Follows the device position while `enabled`. */
export function useWatchPosition(enabled: boolean): { position: Position | null; error: string } {
  const [position, setPosition] = useState<Position | null>(null)
  const [error, setError] = useState('')
  const fake = useFakeGps()
  const faking = !!fake

  useEffect(() => {
    if (!enabled || faking) return
    if (!('geolocation' in navigator)) {
      queueMicrotask(() => setError('This browser has no location access.'))
      return
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setError('')
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, time: p.timestamp })
      },
      (e) => setError(ERROR_TEXT[e.code] ?? e.message),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [enabled, faking])

  if (enabled && fake) return { position: { lat: fake.lat, lng: fake.lng, accuracy: fake.accuracy, time: fake.time }, error: '' }
  return { position: enabled ? position : null, error: enabled ? error : '' }
}

/** Keeps the screen from turning off while `enabled` (the page must be visible). */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const request = async () => {
      try {
        const next = await navigator.wakeLock.request('screen')
        if (cancelled) void next.release()
        else lock = next
      } catch {
        // Battery saver or the page is hidden: the screen just follows its usual timeout.
      }
    }
    // The lock is dropped whenever the app goes to the background: take it again on return.
    const onVisible = () => document.visibilityState === 'visible' && void request()
    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [enabled])
}

/**
 * Where the top of the screen points, in degrees clockwise from north, from the
 * phone's compass (works offline). Null when the device has none (PCs) or
 * hasn't answered yet. Chrome on Android sends `deviceorientationabsolute`.
 */
export function useHeading(enabled: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null)
  const fake = useFakeGps()

  useEffect(() => {
    if (!enabled) return
    let last: number | null = null
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha == null) return
      // alpha turns counterclockwise; a rotated screen (landscape) adds its angle.
      const next = (360 - e.alpha + (screen.orientation?.angle ?? 0)) % 360
      // Ignore jitter under 2° so the page doesn't re-render dozens of times a second.
      if (last != null && Math.abs(((next - last + 540) % 360) - 180) < 2) return
      last = next
      setHeading(next)
    }
    window.addEventListener('deviceorientationabsolute', onOrientation as EventListener)
    return () => window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener)
  }, [enabled])

  if (enabled && fake) return fake.heading
  return enabled ? heading : null
}

/** Bearing from a to b in degrees clockwise from north (0–360). */
export function bearing(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180
  const y = Math.sin((b.lng - a.lng) * rad) * Math.cos(b.lat * rad)
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad)
  return (Math.atan2(y, x) / rad + 360) % 360
}

/** Compass direction from a to b: "N", "NE"… */
export function compassDirection(a: LatLng, b: LatLng): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(bearing(a, b) / 45) % 8]
}

/** "80 m", "1.2 km" */
export function formatDistance(metres: number): string {
  return metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`
}
