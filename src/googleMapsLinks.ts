// "Open in Google Maps" links (Maps URLs: free, no API key, no request from
// the app). They open the Google Maps app on the phone when installed.

import type { Place, Segment } from './db/model'

// Google ignores a place ID sent with coordinates and opens the business
// nearest to them instead (Kyoto National Garden became a café next to it), so
// a place with an ID is sent by name + ID; one without (custom pin, base) by
// coordinates.

export function placeUrl(place: Pick<Place, 'name' | 'lat' | 'lng' | 'googlePlaceId'>): string {
  const params = new URLSearchParams({ api: '1', query: place.googlePlaceId ? place.name : coords(place) })
  if (place.googlePlaceId) params.set('query_place_id', place.googlePlaceId)
  return `https://www.google.com/maps/search/?${params}`
}

/** Directions from one place to the next, in the mode that best matches the segments. */
export function directionsUrl(from: Place, to: Place, segments: Segment[]): string {
  const params = new URLSearchParams({
    api: '1',
    origin: from.googlePlaceId ? from.name : coords(from),
    destination: to.googlePlaceId ? to.name : coords(to),
    travelmode: travelMode(segments),
  })
  if (from.googlePlaceId) params.set('origin_place_id', from.googlePlaceId)
  if (to.googlePlaceId) params.set('destination_place_id', to.googlePlaceId)
  return `https://www.google.com/maps/dir/?${params}`
}

/**
 * Directions through several stops in order (at most 11: origin, 9 waypoints, destination). No travel mode:
 * Google's transit directions don't take waypoints, so the app picks one. Waypoints go by name + place ID only
 * when every one has an ID (the two lists must match), else by coordinates.
 */
export function directionsStopsUrl(stops: Pick<Place, 'name' | 'lat' | 'lng' | 'googlePlaceId'>[]): string {
  const first = stops[0]
  const last = stops.at(-1)!
  const params = new URLSearchParams({
    api: '1',
    origin: first.googlePlaceId ? first.name : coords(first),
    destination: last.googlePlaceId ? last.name : coords(last),
  })
  if (first.googlePlaceId) params.set('origin_place_id', first.googlePlaceId)
  if (last.googlePlaceId) params.set('destination_place_id', last.googlePlaceId)
  const middle = stops.slice(1, -1)
  if (middle.length) {
    const byId = middle.every((s) => s.googlePlaceId)
    params.set('waypoints', middle.map((s) => (byId ? s.name.replace(/\|/g, ' ') : coords(s))).join('|'))
    if (byId) params.set('waypoint_place_ids', middle.map((s) => s.googlePlaceId).join('|'))
  }
  return `https://www.google.com/maps/dir/?${params}`
}

function coords(place: Pick<Place, 'lat' | 'lng'>): string {
  return `${place.lat},${place.lng}`
}

function travelMode(segments: Segment[]): 'transit' | 'walking' | 'driving' {
  const modes = new Set(segments.map((s) => s.mode))
  if (['bus', 'train', 'shinkansen', 'subway', 'ferry'].some((m) => modes.has(m as Segment['mode']))) return 'transit'
  if (modes.has('taxi') || modes.has('car')) return 'driving'
  if (modes.has('walk')) return 'walking'
  return 'transit'
}
