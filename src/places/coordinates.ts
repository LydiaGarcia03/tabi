// Coordinates typed or pasted into a place search: read here, never sent to Google (no request, works offline).

export interface LatLng {
  lat: number
  lng: number
}

/** One coordinate: decimal ("34.679788", "-23.5") or degrees/minutes/seconds ("34°40'47.2\"N", "135°36.07'E"). */
const PART = String.raw`([-+]?\d+(?:\.\d+)?)\s*°?\s*(?:(\d+(?:\.\d+)?)\s*['′’]\s*)?(?:(\d+(?:\.\d+)?)\s*(?:"|″|”|'')\s*)?([NSEWnsew])?`
const PAIR = new RegExp(String.raw`^\s*${PART}\s*[,;\s]\s*${PART}\s*$`)

/**
 * "34.679788, 135.601221", "34°40'47.2\"N 135°36'04.4\"E", or a Google Maps link (the place's own !3d…!4d…
 * point, else the map centre after @ or ?q=). Null when the text is anything else (a place name).
 */
export function parseCoordinates(text: string): LatLng | null {
  const trimmed = text.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    const match = trimmed.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) ?? trimmed.match(/[@=](-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/)
    return match ? valid(Number(match[1]), Number(match[2])) : null
  }
  const match = trimmed.match(PAIR)
  if (!match) return null
  const first = part(match.slice(1, 5))
  const second = part(match.slice(5, 9))
  if (!first || !second) return null
  // "135°36'E 34°40'N": longitude first when the letters say so.
  const swap = (first.hemisphere === 'E' || first.hemisphere === 'W') && (second.hemisphere === 'N' || second.hemisphere === 'S')
  return swap ? valid(second.value, first.value) : valid(first.value, second.value)
}

/** "34.67979, 135.60122" (5 decimals ≈ 1 m). */
export function formatCoordinates(p: LatLng): string {
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`
}

function part([degrees, minutes, seconds, letter]: string[]): { value: number; hemisphere?: string } | null {
  const m = minutes ? Number(minutes) : 0
  const s = seconds ? Number(seconds) : 0
  if (m >= 60 || s >= 60) return null
  const d = Number(degrees)
  const value = Math.abs(d) + m / 60 + s / 3600
  const hemisphere = letter?.toUpperCase()
  const negative = d < 0 || degrees.startsWith('-') || hemisphere === 'S' || hemisphere === 'W'
  return { value: negative ? -value : value, hemisphere }
}

function valid(lat: number, lng: number): LatLng | null {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null
}
