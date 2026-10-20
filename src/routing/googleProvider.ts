// Google Routes API through the Maps JavaScript API (routes library), so the
// referrer-restricted browser key works without a backend.

import {
  RouteProviderError,
  withTimeout,
  type LatLng,
  type RouteOption,
  type RouteProvider,
  type RouteSegment,
  type SegmentMode,
} from './types'

const TIMEOUT_MS = 15_000

// Only the fields we use (field mask keeps the request lean).
const FIELDS = ['durationMillis', 'distanceMeters', 'path', 'legs', 'localizedValues', 'travelAdvisory', 'warnings']

export const googleProvider: RouteProvider = {
  id: 'google',
  name: 'Google Routes',

  async computeTransit(request) {
    if (typeof google === 'undefined' || !google.maps?.importLibrary) {
      throw new RouteProviderError('not-configured', 'Google Maps is not loaded (is the API key set?).')
    }

    let response: Awaited<ReturnType<typeof google.maps.routes.Route.computeRoutes>>
    try {
      const { Route } = (await google.maps.importLibrary('routes')) as google.maps.RoutesLibrary
      response = await withTimeout(
        Route.computeRoutes({
          origin: request.origin,
          destination: request.destination,
          travelMode: 'TRANSIT',
          departureTime: request.departureTime,
          computeAlternativeRoutes: true,
          language: 'en',
          region: 'jp',
          fields: FIELDS,
        }),
        TIMEOUT_MS,
      )
    } catch (error) {
      throw toProviderError(error)
    }

    const routes = response.routes ?? []
    const notes: string[] = []
    if (routes.length === 0) notes.push('Google returned no route for TRANSIT.')
    if (response.fallbackInfo?.reason) {
      notes.push(`Fallback used: ${response.fallbackInfo.reason} (${response.fallbackInfo.routingMode ?? '?'}).`)
    }

    const options = routes.map(toOption)
    options.forEach((option, i) => {
      if (!option.segments.some((s) => s.mode !== 'walk')) {
        notes.push(`Option ${i + 1} has no transit steps (walking only).`)
      }
    })
    for (const route of routes) notes.push(...(route.warnings ?? []))

    return {
      providerId: 'google',
      fetchedAt: new Date().toISOString(),
      options,
      notes,
      raw: { routes: routes.map((r) => r.toJSON()), fallbackInfo: response.fallbackInfo?.toJSON() ?? null },
    }
  },
}

function toOption(route: google.maps.routes.Route): RouteOption {
  const steps = route.legs?.flatMap((leg) => leg.steps) ?? []
  const segments: RouteSegment[] = []

  for (const step of steps) {
    const path = step.path.map(toLatLng)
    const minutes = millisToMinutes(step.staticDurationMillis)
    const transit = step.transitDetails
    const previous = segments.at(-1)

    if (!transit) {
      // Google splits walking into one step per instruction; merge them.
      if (previous?.mode === 'walk') {
        previous.distanceMeters = (previous.distanceMeters ?? 0) + step.distanceMeters
        previous.durationMinutes = (previous.durationMinutes ?? 0) + (minutes ?? 0)
        previous.path.push(...path)
      } else {
        segments.push({ mode: 'walk', distanceMeters: step.distanceMeters, durationMinutes: minutes, path })
      }
      continue
    }

    const line = transit.transitLine
    segments.push({
      mode: vehicleToMode(line?.vehicle?.vehicleType),
      lineName: line?.name ?? line?.shortName ?? undefined,
      operator: line?.agencies.map((a) => a.name).filter(Boolean).join(', ') || undefined,
      fromName: transit.departureStop?.name ?? undefined,
      toName: transit.arrivalStop?.name ?? undefined,
      departureTime: transit.departureTime?.toISOString(),
      arrivalTime: transit.arrivalTime?.toISOString(),
      distanceMeters: step.distanceMeters,
      durationMinutes: minutes,
      color: line?.color ?? undefined,
      path,
    })
  }

  // Name walking segments after the stops they connect.
  segments.forEach((segment, i) => {
    if (segment.mode !== 'walk') return
    segment.fromName ??= segments[i - 1]?.toName
    segment.toName ??= segments[i + 1]?.fromName
  })

  const transitSegments = segments.filter((s) => s.mode !== 'walk')
  const fare = route.travelAdvisory?.transitFare
  return {
    departureTime: transitSegments[0]?.departureTime,
    arrivalTime: transitSegments.at(-1)?.arrivalTime,
    durationMinutes: millisToMinutes(route.durationMillis),
    distanceMeters: route.distanceMeters,
    transfers: Math.max(0, transitSegments.length - 1),
    fare: fare ? { amount: fare.units + fare.nanos / 1e9, currency: fare.currencyCode } : undefined,
    segments,
    lines: segments.map((s) => ({ path: s.path, mode: s.mode, color: s.color })),
  }
}

function vehicleToMode(type: string | null | undefined): SegmentMode {
  switch (type) {
    case 'BUS':
    case 'INTERCITY_BUS':
    case 'TROLLEYBUS':
      return 'bus'
    case 'SUBWAY':
    case 'METRO_RAIL':
      return 'subway'
    case 'RAIL':
    case 'HEAVY_RAIL':
    case 'COMMUTER_TRAIN':
    case 'HIGH_SPEED_TRAIN':
    case 'LONG_DISTANCE_TRAIN':
    case 'MONORAIL':
    case 'TRAM':
      return 'train'
    case 'FERRY':
      return 'ferry'
    case 'SHARE_TAXI':
      return 'taxi'
    default:
      return 'other'
  }
}

function toLatLng(point: google.maps.LatLngAltitude): LatLng {
  return { lat: point.lat, lng: point.lng }
}

function millisToMinutes(ms: number | null | undefined): number | undefined {
  return ms == null ? undefined : Math.round(ms / 60_000)
}

function toProviderError(error: unknown): RouteProviderError {
  if (error instanceof RouteProviderError) return error
  const message = error instanceof Error ? error.message : String(error)
  if (/denied|api.?key|not authorized|permission/i.test(message)) return new RouteProviderError('auth', message)
  if (/quota|rate|exceeded/i.test(message)) return new RouteProviderError('quota', message)
  if (/network|fetch|offline/i.test(message)) return new RouteProviderError('network', message)
  return new RouteProviderError('unknown', message)
}
