// NAVITIME Route (totalnavi) through RapidAPI. Basic plan: 500 requests per
// month with a hard limit, so this must only run on an explicit user action
// and results should be stored by the caller.
// Docs: https://api-sdk.navitime.co.jp/api/specs/api_guide/route_transit.html

import {
  RouteProviderError,
  type LatLng,
  type Money,
  type RouteOption,
  type RouteProvider,
  type RouteSegment,
  type SegmentMode,
} from './types'

const HOST = 'navitime-route-totalnavi.p.rapidapi.com'
const BASE_URL = `https://${HOST}`
const TIMEOUT_MS = 20_000

// Minimal typing of the parts of the response we read.
interface NtFare {
  [unit: string]: number | undefined
}
interface NtPoint {
  type: 'point'
  name?: string
  coord?: { lat: number; lon: number }
}
interface NtMove {
  type: 'move'
  move?: string
  line_name?: string
  from_time?: string
  to_time?: string
  time?: number
  distance?: number
  transport?: { name?: string; color?: string; company?: { name?: string }; fare?: NtFare }
}
interface NtRoute {
  summary?: { move?: { time?: number; distance?: number; transit_count?: number; from_time?: string; to_time?: string; fare?: NtFare } }
  sections?: (NtPoint | NtMove)[]
  shapes?: { features?: { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> }[] }
}

export function createNavitimeProvider(getApiKey: () => string | null): RouteProvider {
  return {
    id: 'navitime',
    name: 'NAVITIME',

    async computeTransit(request) {
      const apiKey = getApiKey()
      if (!apiKey) throw new RouteProviderError('not-configured', 'RapidAPI key is not set (see Settings).')

      const params = new URLSearchParams({
        start: coord(request.origin),
        goal: coord(request.destination),
        start_time: toTokyoLocalTime(request.departureTime),
        limit: '3',
        shape: 'true',
        shape_color: 'railway_line',
        lang: 'en',
        datum: 'wgs84',
        coord_unit: 'degree',
      })

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
      let response: Response
      try {
        response = await fetch(`${BASE_URL}/route_transit?${params}`, {
          headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': HOST },
          signal: controller.signal,
        })
      } catch (error) {
        if (controller.signal.aborted) {
          throw new RouteProviderError('timeout', `No answer after ${TIMEOUT_MS / 1000} s.`)
        }
        throw new RouteProviderError('network', error instanceof Error ? error.message : String(error))
      } finally {
        clearTimeout(timer)
      }

      if (!response.ok) {
        const body = (await response.text().catch(() => '')).slice(0, 300)
        const detail = `HTTP ${response.status}${body ? `: ${body}` : ''}`
        if (response.status === 401 || response.status === 403) throw new RouteProviderError('auth', detail)
        if (response.status === 429) throw new RouteProviderError('quota', detail)
        throw new RouteProviderError('unknown', detail)
      }

      const raw = (await response.json()) as { items?: NtRoute[] }
      const items = raw.items ?? []
      return {
        providerId: 'navitime',
        fetchedAt: new Date().toISOString(),
        options: items.map(toOption),
        notes: items.length === 0 ? ['NAVITIME returned no route.'] : [],
        raw,
      }
    },
  }
}

function toOption(item: NtRoute): RouteOption {
  const sections = item.sections ?? []
  const segments: RouteSegment[] = []

  sections.forEach((section, i) => {
    if (section.type !== 'move') return
    const from = sections[i - 1] as NtPoint | undefined
    const to = sections[i + 1] as NtPoint | undefined
    const mode = moveToMode(section)
    segments.push({
      mode,
      lineName: mode === 'walk' ? undefined : (section.transport?.name ?? section.line_name),
      operator: section.transport?.company?.name,
      fromName: from?.name,
      toName: to?.name,
      departureTime: section.from_time,
      arrivalTime: section.to_time,
      distanceMeters: section.distance,
      durationMinutes: section.time,
      fare: toMoney(section.transport?.fare),
      color: toCssColor(section.transport?.color),
      path: [from?.coord, to?.coord].filter((c) => c != null).map((c) => ({ lat: c.lat, lng: c.lon })),
    })
  })

  const move = item.summary?.move
  return {
    departureTime: move?.from_time,
    arrivalTime: move?.to_time,
    durationMinutes: move?.time,
    distanceMeters: move?.distance,
    transfers: move?.transit_count,
    fare: toMoney(move?.fare),
    segments,
    lines: shapesToLines(item.shapes) ?? segments.map((s) => ({ path: s.path, mode: s.mode, color: s.color })),
  }
}

function moveToMode(section: NtMove): SegmentMode {
  const move = section.move ?? ''
  if (move === 'walk') return 'walk'
  if (move.includes('bus')) return 'bus'
  if (move.includes('ferry') || move.includes('ship')) return 'ferry'
  if (move === 'car') return 'taxi'
  if (move.includes('train')) {
    const names = `${section.transport?.company?.name ?? ''} ${section.line_name ?? ''}`
    return /metro|subway|toei/i.test(names) ? 'subway' : 'train'
  }
  return 'other'
}

/** Prefers the IC card fare (unit_48), falling back to the ticket fare (unit_0). */
function toMoney(fare: NtFare | undefined): Money | undefined {
  const amount = fare?.unit_48 ?? fare?.unit_0
  return amount == null ? undefined : { amount, currency: 'JPY' }
}

function shapesToLines(shapes: NtRoute['shapes']): RouteOption['lines'] | undefined {
  const features = shapes?.features
  if (!features?.length) return undefined
  const lines: RouteOption['lines'] = []
  for (const feature of features) {
    const { type, coordinates } = feature.geometry ?? {}
    const parts = type === 'LineString' ? [coordinates] : type === 'MultiLineString' ? (coordinates as unknown[]) : []
    const props = feature.properties ?? {}
    const color = toCssColor((props.color ?? props.stroke) as string | undefined)
    for (const part of parts) {
      const path = (part as [number, number][]).map(([lng, lat]) => ({ lat, lng }))
      if (path.length > 1) lines.push({ path, color })
    }
  }
  return lines.length ? lines : undefined
}

function toCssColor(color: string | undefined): string | undefined {
  if (!color) return undefined
  return /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : color
}

function coord(point: LatLng): string {
  return `${point.lat},${point.lng}`
}

/** Formats a Date as Tokyo local time, "YYYY-MM-DDThh:mm:ss" (the format NAVITIME expects). */
function toTokyoLocalTime(date: Date): string {
  const tokyo = new Date(date.getTime() + 9 * 60 * 60 * 1000) // Japan has no DST: always UTC+9
  return tokyo.toISOString().slice(0, 19)
}
