// Colors of the city tags. The open trip's cities get distinct colors in
// visiting order (shared through a context), unless one was picked in the
// city's form (`Stay.hue`); unknown names fall back to a stable hash.

import { createContext, useContext } from 'react'
import type { Stay } from './db/model'

/** Well-separated hues, so neighbouring cities never look alike. */
export const CITY_HUES = [0, 210, 130, 280, 35, 175, 330, 60, 240, 100]

const key = (city: string) => city.trim().toLowerCase()

/** The automatic colors: the next hue for each city, in visiting order. */
export function autoCityHues(stays: Pick<Stay, 'city' | 'startDate'>[]): Map<string, number> {
  const names = [...stays].sort((a, b) => a.startDate.localeCompare(b.startDate)).map((s) => key(s.city))
  return new Map([...new Set(names)].map((name, i) => [name, CITY_HUES[i % CITY_HUES.length]]))
}

/** The hue picked for a city in its form, if any (the same for every stay of that name). */
export function pickedCityHue(stays: Stay[], city: string): number | undefined {
  return stays.find((s) => key(s.city) === key(city) && s.hue != null)?.hue
}

export function cityHueMap(stays: Stay[]): Map<string, number> {
  const hues = autoCityHues(stays)
  for (const s of stays) if (s.hue != null) hues.set(key(s.city), s.hue)
  return hues
}

export const CityColorsContext = createContext<Map<string, number>>(new Map())

/** Hue (0–360) for a city tag. */
export function useCityHue(city: string): number {
  const hues = useContext(CityColorsContext)
  const known = hues.get(key(city))
  if (known != null) return known
  let hash = 0
  for (const ch of key(city)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return CITY_HUES[hash % CITY_HUES.length]
}
