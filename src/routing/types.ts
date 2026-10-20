// Provider-neutral route types. Every route source (Google, NAVITIME, future
// ones) is hidden behind RouteProvider and returns these shapes, so the rest
// of the app never depends on a specific API.

export type SegmentMode = 'walk' | 'bus' | 'train' | 'subway' | 'taxi' | 'ferry' | 'other'

export interface LatLng {
  lat: number
  lng: number
}

export interface RouteRequest {
  origin: LatLng
  destination: LatLng
  departureTime: Date
}

export interface Money {
  amount: number
  currency: string
}

export interface RouteSegment {
  mode: SegmentMode
  lineName?: string
  operator?: string
  fromName?: string
  toName?: string
  /** ISO 8601 timestamps. */
  departureTime?: string
  arrivalTime?: string
  distanceMeters?: number
  durationMinutes?: number
  fare?: Money
  /** Line color as a CSS color, when the provider knows it. */
  color?: string
  path: LatLng[]
}

export interface RouteOption {
  departureTime?: string
  arrivalTime?: string
  durationMinutes?: number
  distanceMeters?: number
  transfers?: number
  fare?: Money
  segments: RouteSegment[]
  /** Polylines to draw on the map (one per segment or per provider shape). */
  lines: { path: LatLng[]; mode?: SegmentMode; color?: string }[]
}

export interface RouteResult {
  providerId: RouteProviderId
  fetchedAt: string
  options: RouteOption[]
  /** Human-readable remarks, e.g. "no transit steps returned". */
  notes: string[]
  /** Original response, kept for debugging. */
  raw: unknown
}

export type RouteProviderId = 'google' | 'navitime'

export interface RouteProvider {
  id: RouteProviderId
  name: string
  computeTransit(request: RouteRequest): Promise<RouteResult>
}

export type RouteErrorKind = 'not-configured' | 'auth' | 'quota' | 'timeout' | 'network' | 'no-route' | 'unknown'

export class RouteProviderError extends Error {
  kind: RouteErrorKind

  constructor(kind: RouteErrorKind, message: string) {
    super(message)
    this.name = 'RouteProviderError'
    this.kind = kind
  }
}

/** Rejects with a 'timeout' error if the promise takes longer than `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new RouteProviderError('timeout', `No answer after ${ms / 1000} s.`)),
      ms,
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
