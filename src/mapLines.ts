// How legs and place pins look on both maps (Google and offline), so they match exactly.

import { MODE_COLOR } from './format'
import type { LatLng, RouteSegment } from './routing/types'

/**
 * Walking: round dots in the segment color with a white rim and a soft dark
 * edge, readable over light and dark maps. Sizes in screen pixels.
 */
export const WALK_DOT = {
  /** Radius of the colored center. */
  radius: 4.5,
  /** Width of the white rim (drawn half outside the center, like Google's stroke). */
  rim: 2,
  /** Soft dark edge around the rim. */
  shadow: 1.5,
  shadowColor: 'rgba(0, 0, 0, 0.35)',
  /** Distance between dot centers. */
  spacing: 13,
}

/** Outer radius of a walking dot, edge included. */
export const WALK_DOT_OUTER = WALK_DOT.radius + WALK_DOT.rim / 2 + WALK_DOT.shadow

/**
 * The line to draw for a step. A ride whose route shape didn't come with it (only its two ends: the provider's
 * shape pieces didn't match, or there were none) is drawn through the stations it passes, when they are known
 * (NAVITIME's stops on the way): close to the tracks, unlike a straight line from end to end.
 */
export function drawnPath(segment: Pick<RouteSegment, 'mode' | 'path' | 'fromCoord' | 'toCoord' | 'intermediateStops'>): LatLng[] {
  if (segment.mode === 'walk' || segment.path.length > 2) return segment.path
  const stations = (segment.intermediateStops ?? []).flatMap((stop) => (stop.coord ? [stop.coord] : []))
  const start = segment.path[0] ?? segment.fromCoord
  const end = segment.path.at(-1) ?? segment.toCoord
  if (stations.length === 0 || !start || !end) return segment.path
  return [start, ...stations, end]
}

/** Transit (bus, train…): a solid line in the line's color. */
export const SOLID_LINE = { width: 5, opacity: 0.9 }

/** A leg with no route yet: short dashes, half transparent. */
export const UNDEFINED_LINE = { color: '#7f1d1d', opacity: 0.5, width: 2.5, dash: 5, gap: 5 }

/** The Logbook: you (a blue GPS dot, `.you-dot`) and where you're going, joined by this thin straight dashed line. */
export interface YouAreHere {
  position: LatLng
  target: LatLng
}

/** From you to where you're going, as the crow flies: longer red dashes, unlike a leg with no route. */
export const YOU_LINE = { color: '#b5332e', opacity: 0.75, width: 2, dash: 7, gap: 6 }

/**
 * A numbered place pin (teardrop, like Google's) as SVG markup, the same on
 * both maps. Selected: bigger, with a thick ring in the walking blue.
 * `dashed`: the position came from Google (not found in OpenStreetMap).
 */
export function placePinSvg(label: string, { selected = false, dashed = false } = {}): string {
  const ring = selected ? MODE_COLOR.walk : dashed ? '#ffffff' : '#7f1d1d'
  const width = selected ? 3.5 : 1.5
  const scale = selected ? 1.25 : 1
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${30 * scale}" height="${40 * scale}" viewBox="-1 -1 30 40" aria-hidden="true">
<path d="M14 1.5C7.1 1.5 1.5 7.1 1.5 14c0 8.6 9.6 16.8 12.5 22.5 2.9-5.7 12.5-13.9 12.5-22.5C26.5 7.1 20.9 1.5 14 1.5z" fill="#b5332e" stroke="${ring}" stroke-width="${width}" stroke-linejoin="round"${dashed ? ' stroke-dasharray="3 2"' : ''}/>
<text x="14" y="18.5" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#ffffff">${label}</text>
</svg>`
}

/** One walking dot drawn on a canvas, at `pixelRatio` for sharp screens (for the offline map). */
export function drawWalkDot(color: string, pixelRatio: number): ImageData {
  const size = Math.ceil(WALK_DOT_OUTER * 2 * pixelRatio) + 2
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const c = size / 2
  const circle = (r: number) => {
    ctx.beginPath()
    ctx.arc(c, c, r * pixelRatio, 0, Math.PI * 2)
  }
  circle(WALK_DOT_OUTER)
  ctx.fillStyle = WALK_DOT.shadowColor
  ctx.fill()
  circle(WALK_DOT.radius + WALK_DOT.rim / 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  circle(WALK_DOT.radius - WALK_DOT.rim / 2)
  ctx.fillStyle = color
  ctx.fill()
  return ctx.getImageData(0, 0, size, size)
}
