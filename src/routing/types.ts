// Provider-neutral route types. Every route source (Google, NAVITIME, future
// ones) is hidden behind RouteProvider and returns these shapes, so the rest
// of the app never depends on a specific API.

export type SegmentMode = 'walk' | 'bus' | 'train' | 'shinkansen' | 'subway' | 'taxi' | 'ferry' | 'other'

export interface LatLng {
  lat: number
  lng: number
}

export interface RouteRequest {
  origin: LatLng
  destination: LatLng
  departureTime: Date
  /** Ask for routes arriving by this time instead (departureTime is then ignored). */
  arrivalTime?: Date
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
  /** Station exit/entrance used at each end, as the provider wrote it (e.g. "B4口"). */
  fromExit?: string
  toExit?: string
  /** Where the stops are (the path may start at an exit, or be missing). */
  fromCoord?: LatLng
  toCoord?: LatLng
  /** Station numbers on the signs, e.g. "Y15". */
  fromCode?: string
  toCode?: string
  /** Platform/track at each end, when the provider knows it (timetable data only). */
  fromPlatform?: string
  toPlatform?: string
  /** Kind of train, e.g. "Local", "Special Rapid", "Nozomi 123". */
  service?: string
  /** Where the train/bus is bound for, as on the signs ("for Nishi-Umeda"). */
  headsign?: string
  /** Stops between the two ends, in order. */
  intermediateStops?: { name: string; original?: string; time?: string; coord?: LatLng }[]
  /** Best car(s) to ride to get off near the stairs/transfer, e.g. "Cars 1–3", "Front". */
  carHint?: string
  /** ISO 8601 timestamps. */
  departureTime?: string
  arrivalTime?: string
  distanceMeters?: number
  durationMinutes?: number
  fare?: Money
  /** Line color as a CSS color, when the provider knows it. */
  color?: string
  path: LatLng[]
  /** Names as the provider returned them (e.g. Japanese), set when they were translated. */
  originalNames?: { line?: string; operator?: string; from?: string; to?: string; service?: string; headsign?: string; carHint?: string }
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
