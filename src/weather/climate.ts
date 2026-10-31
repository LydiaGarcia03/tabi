// The usual weather of a place at a time of year: the trip is planned months or years ahead, so there is no
// forecast. Averages of the last 10 years from Open-Meteo's historical archive (free, no key, no account, CORS
// open: can't bill; non-commercial use). One request per area (~100 kB), reduced to one line per day of the year
// and kept on the device (localStorage), so it is fetched once and then works offline.

import { useEffect, useState } from 'react'
import { loadJson, saveJson } from '../settings'

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'
const STORAGE_PREFIX = 'tabi.climate.'
const YEARS = 10
/** Days on each side of the date averaged with it, so one odd year weighs less. */
const WINDOW = 3
/** A day with at least this much rain counts as rainy (the usual "rain day"). */
const RAINY_MM = 1

export interface Climate {
  /** Usual low and high, °C. */
  min: number
  max: number
  /** Share of rainy days, 0–100. */
  rain: number
}

/** "MM-DD" → [min, max, rain %]. */
type Normals = Record<string, [number, number, number]>

/** Areas of ~25 km share one download (a city and its day trips nearby). */
function areaKey({ lat, lng }: { lat: number; lng: number }): string {
  return `${Math.round(lat * 4) / 4},${Math.round(lng * 4) / 4}`
}

interface Archive {
  daily: { time: string[]; temperature_2m_max: (number | null)[]; temperature_2m_min: (number | null)[]; precipitation_sum: (number | null)[] }
}

async function download(area: string): Promise<Normals> {
  const [lat, lng] = area.split(',')
  const lastYear = new Date().getFullYear() - 1
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lng,
    start_date: `${lastYear - YEARS + 1}-01-01`,
    end_date: `${lastYear}-12-31`,
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
    timezone: 'auto',
  })
  const response = await fetch(`${ARCHIVE_URL}?${params}`, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`Open-Meteo: ${response.status}`)
  const { daily } = (await response.json()) as Archive
  const sums = new Map<string, { min: number; max: number; rainy: number; n: number }>()
  daily.time.forEach((date, i) => {
    const key = date.slice(5)
    const sum = sums.get(key) ?? { min: 0, max: 0, rainy: 0, n: 0 }
    for (let j = Math.max(0, i - WINDOW); j <= Math.min(daily.time.length - 1, i + WINDOW); j++) {
      const min = daily.temperature_2m_min[j]
      const max = daily.temperature_2m_max[j]
      if (min == null || max == null) continue
      sum.min += min
      sum.max += max
      sum.rainy += (daily.precipitation_sum[j] ?? 0) >= RAINY_MM ? 1 : 0
      sum.n++
    }
    sums.set(key, sum)
  })
  const normals: Normals = {}
  for (const [key, s] of sums) {
    if (s.n) normals[key] = [Math.round(s.min / s.n), Math.round(s.max / s.n), Math.round((s.rainy / s.n) * 20) * 5]
  }
  return normals
}

/** Areas read from storage (or just downloaded), so each is parsed once. */
const known = new Map<string, Normals>()

function storedNormals(area: string): Normals | undefined {
  let normals = known.get(area)
  if (!normals) {
    normals = loadJson<Normals>(STORAGE_PREFIX + area) ?? undefined
    if (normals) known.set(area, normals)
  }
  return normals
}

/** One download per area at a time; an area that failed isn't asked again until the app is reopened. */
const pending = new Map<string, Promise<void>>()

function downloadOnce(area: string): Promise<void> {
  let request = pending.get(area)
  if (!request) {
    request = download(area)
      .then((normals) => {
        saveJson(STORAGE_PREFIX + area, normals)
        known.set(area, normals)
      })
      .catch(() => {})
    pending.set(area, request)
  }
  return request
}

/** The usual weather at a point on a date; undefined until known (downloaded once while online). */
export function useClimate(point: { lat: number; lng: number } | undefined, date: string, online: boolean): Climate | undefined {
  const area = point && areaKey(point)
  const normals = area ? storedNormals(area) : undefined
  // Bumped when a download ends, to read it.
  const [, setDownloads] = useState(0)

  useEffect(() => {
    if (!area || normals || !online) return
    let alive = true
    void downloadOnce(area).then(() => {
      if (alive) setDownloads((n) => n + 1)
    })
    return () => {
      alive = false
    }
  }, [area, normals, online])

  // 29 Feb only exists in leap years: the day before stands in for it.
  const day = normals?.[date.slice(5)] ?? normals?.['02-28']
  return day && { min: day[0], max: day[1], rain: day[2] }
}
