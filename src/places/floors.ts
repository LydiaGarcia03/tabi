import type { Inside } from '../db/model'

/**
 * Floors of a place inside a building, typed by the user. Written the way Japanese signs and lift buttons do:
 * "9F", "B1" (and "9階", "地下1階" under them on Japan trips).
 */

/** The editable texts of `Inside` (empty strings when absent). */
export interface InsideDraft {
  floor: string
  building: string
  way: string
}

export const toInsideDraft = (inside?: Inside): InsideDraft => ({
  floor: inside?.floor ?? '',
  building: inside?.building ?? '',
  way: inside?.way ?? '',
})

/** Only kept with a floor (the building and the way are asked once a floor is typed). */
export function cleanInside(draft: InsideDraft): Inside | undefined {
  const floor = draft.floor.trim()
  if (!floor) return undefined
  return { floor, building: draft.building.trim() || undefined, way: draft.way.trim() || undefined }
}

const ABOVE = /^(\d{1,3})(?:\s*[-–~]\s*(\d{1,3}))?\s*(?:f|fl|floor|階)?$/i
const BELOW = /^(?:b\s*(\d{1,2})\s*f?|地下\s*(\d{1,2})\s*階?)$/i

/** "9" / "9f" / "9階" → "9F", "9-10" → "9–10F", "b1" / "B1F" / "地下1階" → "B1"; anything else as typed. */
export function floorLabel(floor: string): string {
  const text = floor.trim()
  const above = ABOVE.exec(text)
  if (above) return above[2] ? `${above[1]}–${above[2]}F` : `${above[1]}F`
  const below = BELOW.exec(text)
  if (below) return `B${below[1] ?? below[2]}`
  return text
}

/** "9F" → "9階", "9–10F" → "9–10階", "B1" → "地下1階" (as on Japanese signs); nothing for other texts. */
export function floorJapanese(floor: string): string | undefined {
  const label = floorLabel(floor)
  const above = /^(\d+(?:–\d+)?)F$/.exec(label)
  if (above) return `${above[1]}階`
  const below = /^B(\d+)$/.exec(label)
  if (below) return `地下${below[1]}階`
  return undefined
}

/** Up (above the first floor), down (basements), or unknown (1F, "Rooftop"…). */
export function floorWay(floor: string): 'up' | 'down' | undefined {
  const label = floorLabel(floor)
  if (/^B\d+$/.test(label)) return 'down'
  const n = /^(\d+)/.exec(label)
  return n && Number(n[1]) >= 2 ? 'up' : undefined
}
