// Finds each Google place in the downloaded OpenStreetMap data (a point of
// interest with the same name nearby), so the offline map can show it at
// OpenStreetMap's position instead of Google's.

import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import { db } from '../db/db'
import type { Place } from '../db/model'
import { distanceKm } from '../geo'
import type { LatLng } from '../routing/types'
import { MAX_TILE_ZOOM, tileKey, tileX, tileY } from './area'

/** How far OpenStreetMap's point may be from Google's. */
const MAX_DISTANCE_M = 300

export interface OsmMatch extends LatLng {
  /** The name in OpenStreetMap ("Sensō-ji 浅草寺"). */
  name: string
}

interface Poi extends LatLng {
  names: string[]
  label: string
}

/** OSM matches by place id; null = a Google place not found. Custom pins aren't looked up. */
export async function matchPlaces(places: Place[]): Promise<Map<string, OsmMatch | null>> {
  const result = new Map<string, OsmMatch | null>()
  const cache = new Map<string, Poi[]>()
  for (const place of places) {
    if (!place.googlePlaceId) continue
    const pois = await poisAround(place, cache)
    const target = normalize(place.name)
    let best: { poi: Poi; score: number } | null = null
    for (const poi of pois) {
      const metres = distanceKm(place, poi) * 1000
      if (metres > MAX_DISTANCE_M) continue
      const similarity = Math.max(...poi.names.map((n) => nameSimilarity(target, normalize(n))))
      // A close point needs a less exact name.
      const needed = metres < 60 ? 0.5 : 0.7
      const score = similarity - metres / 3000
      if (similarity >= needed && (!best || score > best.score)) best = { poi, score }
    }
    result.set(place.id, best ? { lat: best.poi.lat, lng: best.poi.lng, name: best.poi.label } : null)
  }
  return result
}

/** Named points of interest in the tile of the place and the 8 around it. */
async function poisAround(point: LatLng, cache: Map<string, Poi[]>): Promise<Poi[]> {
  const z = MAX_TILE_ZOOM
  const cx = tileX(point.lng, z)
  const cy = tileY(point.lat, z)
  const all: Poi[] = []
  for (let x = cx - 1; x <= cx + 1; x++) {
    for (let y = cy - 1; y <= cy + 1; y++) {
      const key = tileKey(z, x, y)
      if (!cache.has(key)) cache.set(key, await tilePois(key, x, y, z))
      all.push(...cache.get(key)!)
    }
  }
  return all
}

async function tilePois(key: string, x: number, y: number, z: number): Promise<Poi[]> {
  const tile = await db.mapTiles.get(key)
  if (!tile || tile.data.byteLength === 0) return []
  const vt = new VectorTile(new Pbf(new Uint8Array(tile.data)))
  const pois: Poi[] = []
  // Shops, temples, museums… and station/airport labels.
  for (const layerName of ['poi', 'aerodrome_label']) {
    const layer = vt.layers[layerName]
    if (!layer) continue
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i)
      const props = feature.properties
      const names = ['name', 'name_en', 'name:en', 'name:latin', 'name:ja', 'name:ja-Latn', 'name_int']
        .map((k) => props[k])
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      if (names.length === 0) continue
      const geometry = feature.toGeoJSON(x, y, z).geometry
      if (geometry.type !== 'Point') continue
      const [lng, lat] = geometry.coordinates
      const latin = (props['name:latin'] ?? props.name_en) as string | undefined
      const nonLatin = props['name:nonlatin'] as string | undefined
      pois.push({ lat, lng, names, label: [latin, nonLatin].filter(Boolean).join(' ') || names[0] })
    }
  }
  return pois
}

/** "Sensō-ji Temple" → "sensojitemple" (accents, case, spaces and punctuation ignored). */
function normalize(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/**
 * 1 = same name. One inside the other counts high only when it is a good
 * part of it ("Senso-ji" in "Senso-ji Temple", not "Monja" in "Tsukishima
 * Monja Moheji Honten"). Otherwise shared letter pairs (Dice).
 */
function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const [short, long] = a.length < b.length ? [a, b] : [b, a]
  if (short.length >= 4 && short.length / long.length >= 0.5 && long.includes(short)) return 0.9
  const pairs = (s: string) => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1)
    return m
  }
  const pa = pairs(a)
  const pb = pairs(b)
  let shared = 0
  for (const [pair, count] of pa) shared += Math.min(count, pb.get(pair) ?? 0)
  return (2 * shared) / (a.length - 1 + (b.length - 1))
}
