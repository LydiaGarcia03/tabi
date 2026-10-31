// NAVITIME Route (totalnavi) through RapidAPI. Basic plan: 500 requests per
// month with a hard limit, so this must only run on an explicit user action
// and results should be stored by the caller.
// Docs: https://api-sdk.navitime.co.jp/api/specs/api_guide/route_transit.html

import { distanceKm } from '../geo'
import { recordNavitimeResponse } from '../usage/navitimeUsage'
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
// In `npm run dev`, through the dev server's proxy (vite.config.ts): same origin, so RapidAPI's monthly count can be read.
const BASE_URL = import.meta.env.DEV ? '/navitime-api' : `https://${HOST}`
const TIMEOUT_MS = 20_000

// Minimal typing of the parts of the response we read.
interface NtFare {
  [unit: string]: number | undefined
}
interface NtPoint {
  type: 'point'
  name?: string
  coord?: { lat: number; lon: number }
  /** Station exit/entrance, e.g. "B4口". */
  gateway?: string
  /** Station numbers of the lines leaving/arriving here, e.g. { symbol: "Y", number: "15" }. */
  numbering?: { departure?: NtNumber[]; arrival?: NtNumber[] }
  /** Platforms; only with timetable data (a separate contract), read in case they come. */
  start_platform?: string
  goal_platform?: string
}
interface NtNumber {
  symbol?: string
  number?: string
}
interface NtCallingAt {
  name?: string
  coord?: { lat: number; lon: number }
  from_time?: string
  to_time?: string
}
/** One piece of the route geometry; pieces come in the same order as move sections. */
interface NtShapeFeature {
  geometry?: { type?: string; coordinates?: unknown }
  properties?: { ways?: 'walk' | 'transport'; inline?: { color?: string } }
}
interface NtMove {
  type: 'move'
  move?: string
  line_name?: string
  from_time?: string
  to_time?: string
  time?: number
  distance?: number
  transport?: {
    name?: string
    color?: string
    company?: { name?: string }
    fare?: NtFare
    /** Kind of train, e.g. "普通", "新快速". */
    type?: string
    destination?: { name?: string }
    links?: { destination?: { name?: string } }[]
    /** Best car to get off from, e.g. "後", "１・２・３". */
    getoff?: string
    /** Only with options=railway_calling_at; may include both ends. */
    calling_at?: NtCallingAt[]
  }
}
interface NtRoute {
  summary?: { move?: { time?: number; distance?: number; transit_count?: number; from_time?: string; to_time?: string; fare?: NtFare } }
  sections?: (NtPoint | NtMove)[]
  shapes?: { features?: NtShapeFeature[] }
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
        // goal_time = arrive by: the routes that get there in time, leaving as late as possible.
        ...(request.arrivalTime
          ? { goal_time: toTokyoLocalTime(request.arrivalTime) }
          : { start_time: toTokyoLocalTime(request.departureTime) }),
        limit: '3',
        shape: 'true',
        shape_color: 'railway_line',
        // No `lang`: the Basic plan rejects it ("bad usage on this contract: Multilingual"),
        // so names come back in Japanese.
        datum: 'wgs84',
        coord_unit: 'degree',
      })
      // The stops on the way (to count them and know where to get off). If the
      // plan refuses the option, ask again without it and never send it again.
      const callingAt = callingAtSupported()
      if (callingAt) params.set('options', 'railway_calling_at')

      let response = await send(params, apiKey)
      let body = response.ok ? '' : await response.text().catch(() => '')
      if (callingAt && response.status === 400 && /contract|options/i.test(body)) {
        setCallingAtUnsupported()
        params.delete('options')
        response = await send(params, apiKey)
        body = response.ok ? '' : await response.text().catch(() => '')
      }

      if (!response.ok) {
        body = body.slice(0, 300)
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

async function send(params: URLSearchParams, apiKey: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${BASE_URL}/route_transit?${params}`, {
      headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': HOST },
      signal: controller.signal,
    })
    recordNavitimeResponse(response)
    return response
  } catch (error) {
    if (controller.signal.aborted) {
      throw new RouteProviderError('timeout', `No answer after ${TIMEOUT_MS / 1000} s.`)
    }
    throw new RouteProviderError('network', error instanceof Error ? error.message : String(error))
  } finally {
    clearTimeout(timer)
  }
}

const CALLING_AT_KEY = 'tabi.navitime.callingAt'

function callingAtSupported(): boolean {
  try {
    return localStorage.getItem(CALLING_AT_KEY) !== 'unsupported'
  } catch {
    return true
  }
}

function setCallingAtUnsupported(): void {
  try {
    localStorage.setItem(CALLING_AT_KEY, 'unsupported')
  } catch {
    // Not remembered: the next request tries again.
  }
}

interface NtMoveWithPoints {
  section: NtMove
  from?: NtPoint
  to?: NtPoint
}

function toOption(item: NtRoute): RouteOption {
  const sections = item.sections ?? []
  const moves: NtMoveWithPoints[] = []
  sections.forEach((section, i) => {
    if (section.type === 'move') {
      moves.push({ section, from: sections[i - 1] as NtPoint | undefined, to: sections[i + 1] as NtPoint | undefined })
    }
  })
  const shapes = assignShapes(moves, item.shapes?.features ?? [])

  const segments: RouteSegment[] = moves.map(({ section, from, to }, k) => {
    const mode = moveToMode(section)
    const straight = [from?.coord, to?.coord].filter((c) => c != null).map(toLatLng)
    const transport = mode === 'walk' ? undefined : section.transport
    return {
      mode,
      lineName: mode === 'walk' ? undefined : (section.transport?.name ?? section.line_name),
      operator: section.transport?.company?.name,
      fromName: from?.name,
      toName: to?.name,
      fromExit: from?.gateway,
      toExit: to?.gateway,
      fromCoord: from?.coord && toLatLng(from.coord),
      toCoord: to?.coord && toLatLng(to.coord),
      fromCode: transport && stationCode(from?.numbering?.departure),
      toCode: transport && stationCode(to?.numbering?.arrival),
      fromPlatform: transport && from?.start_platform,
      toPlatform: transport && to?.goal_platform,
      service: transport?.type,
      headsign: transport?.destination?.name ?? transport?.links?.find((l) => l.destination?.name)?.destination?.name,
      intermediateStops: transport?.calling_at && intermediateStops(transport.calling_at, from, to),
      carHint: transport?.getoff,
      departureTime: section.from_time,
      arrivalTime: section.to_time,
      distanceMeters: section.distance,
      durationMinutes: section.time,
      fare: toMoney(section.transport?.fare),
      color: mode === 'walk' ? undefined : (toCssColor(section.transport?.color) ?? shapes[k]?.color),
      path: shapes[k]?.path ?? straight,
    }
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
    lines: segments.map((s) => ({ path: s.path, mode: s.mode, color: s.color })),
  }
}

/**
 * Gives each move section its piece(s) of the route geometry. Pieces come in
 * route order, tagged walk/transport. For each section, the first piece of its
 * kind starting near where the section starts (looking a few pieces ahead) is
 * taken, then the pieces of the same kind that follow on from it, until the
 * path reaches the section's end point. A section without a matching piece
 * gets null (drawn through its stations, else straight: `drawnPath`).
 *
 * Before 2026-10-31 a section could only take the very next piece: one piece
 * that didn't match (a station point more than 500 m from where its track
 * starts, in big stations like Osaka or Kyoto) stopped the matching, and every
 * later step of the route was drawn as a straight line.
 */
function assignShapes(moves: NtMoveWithPoints[], features: NtShapeFeature[]) {
  const pieces = features.flatMap((feature) =>
    lineStrings(feature)
      .filter((path) => path.length > 0)
      .map((path) => ({
        path,
        walk: feature.properties?.ways === 'walk',
        color: toCssColor(feature.properties?.inline?.color),
      })),
  )
  let next = 0
  return moves.map(({ section, from, to }) => {
    const walk = section.move === 'walk'
    const gap = walk ? WALK_GAP_KM : RIDE_GAP_KM
    const start = from?.coord && toLatLng(from.coord)
    const end = to?.coord && toLatLng(to.coord)
    // The first piece of this kind, from where the last section stopped, that starts near this section.
    let first = -1
    for (let i = next; i < Math.min(pieces.length, next + LOOK_AHEAD); i++) {
      if (pieces[i].walk === walk && (!start || distanceKm(start, pieces[i].path[0]) <= gap)) {
        first = i
        break
      }
    }
    if (first < 0) return null
    const path: LatLng[] = []
    let color: string | undefined
    let i = first
    while (i < pieces.length && pieces[i].walk === walk) {
      const piece = pieces[i]
      const at = path.at(-1)
      // A piece far from where the path is belongs to a later section of the same kind.
      if (at && distanceKm(at, piece.path[0]) > gap) break
      path.push(...piece.path)
      color ??= piece.color
      i++
      const reached = path.at(-1)
      if (end && reached && distanceKm(reached, end) < gap) break
    }
    next = i
    return path.length > 1 ? { path, color } : null
  })
}

/** A walk's piece starts where the place or the station exit is. */
const WALK_GAP_KM = 0.5
/** A station's point can be far from where its tracks start (Osaka, Kyoto, Umeda are huge). */
const RIDE_GAP_KM = 1.5
/** How many pieces ahead a section may look for its own (skipping ones no section took). */
const LOOK_AHEAD = 6

/** "Y" + "15" → "Y15"; the first number when a station has several on one line. */
function stationCode(numbers: NtNumber[] | undefined): string | undefined {
  const first = numbers?.find((n) => n.symbol || n.number)
  return first ? `${first.symbol ?? ''}${first.number ?? ''}` : undefined
}

/** The stops between the two ends (calling_at may list the ends too). */
function intermediateStops(stops: NtCallingAt[], from: NtPoint | undefined, to: NtPoint | undefined) {
  return stops
    .filter((stop, i) => stop.name && !(i === 0 && stop.name === from?.name) && !(i === stops.length - 1 && stop.name === to?.name))
    .map((stop) => ({
      name: stop.name!,
      time: stop.from_time ?? stop.to_time,
      coord: stop.coord && toLatLng(stop.coord),
    }))
}

function lineStrings(feature: NtShapeFeature): LatLng[][] {
  const { type, coordinates } = feature.geometry ?? {}
  const parts = type === 'LineString' ? [coordinates] : type === 'MultiLineString' ? (coordinates as unknown[]) : []
  return parts.map((part) => (part as [number, number][]).map(([lng, lat]) => ({ lat, lng })))
}

function toLatLng(coord: { lat: number; lon: number }): LatLng {
  return { lat: coord.lat, lng: coord.lon }
}

function moveToMode(section: NtMove): SegmentMode {
  const move = section.move ?? ''
  if (move === 'walk') return 'walk'
  if (move.includes('bus')) return 'bus'
  if (move.includes('ferry') || move.includes('ship')) return 'ferry'
  if (move === 'car') return 'taxi'
  // Flights come as "空路 (…空港-…空港)" (the move name isn't documented for the Basic plan).
  if (/air|plane|flight/i.test(move) || /^空路/.test(section.transport?.name ?? section.line_name ?? '')) return 'flight'
  if (move.includes('train')) {
    const names = `${section.transport?.company?.name ?? ''} ${section.line_name ?? ''} ${section.transport?.name ?? ''}`
    if (/新幹線|shinkansen/i.test(names) || move.includes('superexpress')) return 'shinkansen'
    // 市営: city-run lines are subways (Kyoto, Yokohama, Sendai, Fukuoka, Sapporo).
    return /metro|subway|toei|地下鉄|メトロ|都営|市営/i.test(names) ? 'subway' : 'train'
  }
  return 'other'
}

/** Prefers the IC card fare (unit_48), falling back to the ticket fare (unit_0). */
function toMoney(fare: NtFare | undefined): Money | undefined {
  const amount = fare?.unit_48 ?? fare?.unit_0
  return amount == null ? undefined : { amount, currency: 'JPY' }
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
