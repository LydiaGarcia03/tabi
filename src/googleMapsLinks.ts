// "Open in Google Maps" links (Maps URLs: free, no API key, no request from
// the app). They open the Google Maps app on the phone when installed.

import type { Place, Segment } from './db/model'

export function placeUrl(place: Place): string {
  const params = new URLSearchParams({ api: '1', query: `${place.lat},${place.lng}` })
  if (place.googlePlaceId) params.set('query_place_id', place.googlePlaceId)
  return `https://www.google.com/maps/search/?${params}`
}

/** Directions from one place to the next, in the mode that best matches the segments. */
export function directionsUrl(from: Place, to: Place, segments: Segment[]): string {
  const params = new URLSearchParams({
    api: '1',
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
    travelmode: travelMode(segments),
  })
  if (from.googlePlaceId) params.set('origin_place_id', from.googlePlaceId)
  if (to.googlePlaceId) params.set('destination_place_id', to.googlePlaceId)
  return `https://www.google.com/maps/dir/?${params}`
}

function travelMode(segments: Segment[]): 'transit' | 'walking' | 'driving' {
  const modes = new Set(segments.map((s) => s.mode))
  if (['bus', 'train', 'subway', 'ferry'].some((m) => modes.has(m as Segment['mode']))) return 'transit'
  if (modes.has('taxi')) return 'driving'
  if (modes.has('walk')) return 'walking'
  return 'transit'
}
