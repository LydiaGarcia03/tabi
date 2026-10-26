// A segment being drawn by hand on the day map.

import type { LatLng, SegmentMode } from './routing/types'

export interface Drawing {
  fromPlaceId: string
  toPlaceId: string
  segmentId: string
  mode: SegmentMode
  color?: string
  /** Where the segment must start/end when known (previous/next segment or a place). */
  start?: LatLng
  end?: LatLng
  /**
   * The leg's destination, when this is its last segment: offered as a button
   * ("End at …"), never forced (the segment may stop before it, e.g. at a bus stop).
   */
  destination?: LatLng & { name: string }
  /**
   * Where it would start automatically (the leg's origin, or where the previous
   * step ends): offered as a checkbox, so the start can be tapped instead.
   */
  origin?: LatLng & { label: string }
  /** Points tapped by the user, in order, between start and end. */
  taps: LatLng[]
  /** Street-following path for the current points, once computed. */
  snapped?: { path: LatLng[]; distanceMeters?: number; durationMinutes?: number }
}

/**
 * The leg the maps focus on (opened in the list, or being drawn): only its
 * line is shown, and the map fits `points` (both ends and every step's path).
 */
export interface LegFocus {
  fromId: string
  toId: string
  points: LatLng[]
}

export function drawingPoints(drawing: Drawing): LatLng[] {
  return [drawing.start, ...drawing.taps, drawing.end].filter((p) => p != null)
}

/** Google travel mode that follows streets for this segment mode, if any. */
export function streetTravelMode(mode: SegmentMode): 'WALKING' | 'DRIVING' | null {
  if (mode === 'walk') return 'WALKING'
  if (mode === 'bus' || mode === 'taxi') return 'DRIVING'
  return null // Trains, subways and ferries don't follow streets.
}
