// Which map tiles to download for a trip: detailed around each place and
// city base, coarser around them, and an overview of the whole region.

import type { LatLng } from '../routing/types'

/** OpenFreeMap's tiles stop at zoom 14; the map draws closer zooms from them. */
export const MAX_TILE_ZOOM = 14
/** OpenFreeMap's limit for one offline download. */
export const MAX_TILES = 3000

/** Zoom levels and the radius (km) they cover around each point, most detailed first. */
type Plan = { zooms: [number, number]; radiusKm: number }[]

// Tried in order until the area fits in MAX_TILES.
const PLANS: Plan[] = [
  [
    { zooms: [14, 14], radiusKm: 1.5 },
    { zooms: [12, 13], radiusKm: 5 },
    { zooms: [9, 11], radiusKm: 25 },
  ],
  [
    { zooms: [14, 14], radiusKm: 1 },
    { zooms: [12, 13], radiusKm: 3 },
    { zooms: [9, 11], radiusKm: 12 },
  ],
  [
    { zooms: [14, 14], radiusKm: 0.6 },
    { zooms: [12, 13], radiusKm: 2 },
    { zooms: [9, 11], radiusKm: 6 },
  ],
]
/** Up to this zoom, everything inside the box around all points (country/region view). */
const OVERVIEW_ZOOM = 8

export function tileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z)
}

export function tileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z)
}

export function tileKey(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`
}

function addBox(keys: Set<string>, z: number, south: number, west: number, north: number, east: number) {
  const n = 2 ** z
  const clampLat = (lat: number) => Math.max(-85, Math.min(85, lat))
  const [x0, x1] = [tileX(west, z), tileX(east, z)]
  const [y0, y1] = [tileY(clampLat(north), z), tileY(clampLat(south), z)]
  for (let x = Math.max(0, x0); x <= Math.min(n - 1, x1); x++) {
    for (let y = Math.max(0, y0); y <= Math.min(n - 1, y1); y++) keys.add(tileKey(z, x, y))
  }
}

function tilesFor(points: LatLng[], plan: Plan): Set<string> {
  const keys = new Set<string>()
  const lats = points.map((p) => p.lat)
  const lngs = points.map((p) => p.lng)
  for (let z = 0; z <= OVERVIEW_ZOOM; z++) addBox(keys, z, Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs))
  for (const { zooms, radiusKm } of plan) {
    for (const p of points) {
      const dLat = radiusKm / 111
      const dLng = radiusKm / (111 * Math.cos((p.lat * Math.PI) / 180))
      for (let z = zooms[0]; z <= zooms[1]; z++) addBox(keys, z, p.lat - dLat, p.lng - dLng, p.lat + dLat, p.lng + dLng)
    }
  }
  return keys
}

/** The tiles to download around these points: the most detailed plan that fits in MAX_TILES. */
export function areaTiles(points: LatLng[]): { tiles: string[]; detailRadiusKm: number } | null {
  if (points.length === 0) return null
  for (const plan of PLANS) {
    const tiles = tilesFor(points, plan)
    if (tiles.size <= MAX_TILES) return { tiles: [...tiles], detailRadiusKm: plan[0].radiusKm }
  }
  return null
}

/** Whether a point has detailed tiles (zoom 14) downloaded. */
export function isCovered(tiles: Set<string>, point: LatLng): boolean {
  return tiles.has(tileKey(MAX_TILE_ZOOM, tileX(point.lng, MAX_TILE_ZOOM), tileY(point.lat, MAX_TILE_ZOOM)))
}
