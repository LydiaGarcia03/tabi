// Downloads a trip's offline map from OpenFreeMap (OpenStreetMap data, free,
// no key). Their terms allow offline downloads of at most 3,000 tiles or
// 50 MB each, with at most 4 parallel requests.

import { db } from '../db/db'
import type { MapTile } from '../db/model'
import { distanceKm } from '../geo'
import type { LatLng } from '../routing/types'
import { areaTiles, MAX_TILE_ZOOM } from './area'

const BASE = 'https://tiles.openfreemap.org'
/** OpenFreeMap's limit is 50 MB per download; a margin for the files being fetched in parallel. */
const MAX_BYTES = 48 * 1024 * 1024
const PARALLEL = 4
/** The map style (dark mode darkens it: see richStyle.ts). */
export const STYLE = 'liberty'
/**
 * Font ranges for Latin text, punctuation and Japanese symbols. Kanji and
 * kana themselves are drawn with the phone's own fonts (no download).
 */
const FONT_RANGES = ['0-255', '256-511', '8192-8447', '12288-12543', '65280-65535']

export interface Progress {
  done: number
  total: number
  bytes: number
}

/** Downloads (or updates) the offline map around these points. Returns false when the size limit left the farthest parts out. */
export async function downloadTripMap(
  tripId: string,
  points: LatLng[],
  onProgress: (p: Progress) => void,
  signal: AbortSignal,
): Promise<boolean> {
  const area = areaTiles(points)
  if (!area) throw new Error('This trip has no places or city bases to download a map for.')

  const get = async (url: string) => {
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`The map server answered ${res.status} for ${url.replace(BASE, '')}`)
    return res
  }

  // Styles, then the fonts and icons they use.
  const tileJson = await (await get(`${BASE}/planet`)).json()
  const tileUrl: string = tileJson.tiles[0]
  const fontStacks = new Set<string>()
  const sprites = new Set<string>()
  {
    const text = await (await get(`${BASE}/styles/${STYLE}`)).text()
    await db.mapAssets.put({ key: `style/${STYLE}`, data: text })
    const style = JSON.parse(text)
    if (typeof style.sprite === 'string') sprites.add(style.sprite)
    for (const layer of style.layers ?? []) {
      const font = layer.layout?.['text-font']
      if (Array.isArray(font) && font.every((f: unknown) => typeof f === 'string')) fontStacks.add(font.join(','))
    }
  }
  for (const sprite of sprites) {
    for (const suffix of ['.json', '.png', '@2x.json', '@2x.png']) {
      const res = await get(`${sprite}${suffix}`)
      await db.mapAssets.put({ key: assetKey(`${sprite}${suffix}`), data: suffix.endsWith('.json') ? await res.text() : await res.arrayBuffer() })
    }
  }
  for (const stack of fontStacks) {
    for (const range of FONT_RANGES) {
      const res = await fetch(`${BASE}/fonts/${encodeURIComponent(stack)}/${range}.pbf`, { signal })
      // A range a font doesn't have is simply skipped.
      if (res.ok) await db.mapAssets.put({ key: `font/${stack}/${range}`, data: await res.arrayBuffer() })
    }
  }

  // Tiles already on the device (from another trip or an earlier download) are kept.
  const existing = new Set(await db.mapTiles.where('key').anyOf(area.tiles).primaryKeys())
  // Overview first, then detail from the places outwards: if the 50 MB run out
  // (a detailed tile of central Tokyo is ~700 KB), what's left out is the farthest.
  const missing = area.tiles.filter((k) => !existing.has(k)).sort((a, b) => tileOrder(a, points) - tileOrder(b, points))
  const progress: Progress = { done: area.tiles.length - missing.length, total: area.tiles.length, bytes: 0 }
  onProgress({ ...progress })

  let next = 0
  let full = false
  const worker = async () => {
    while (next < missing.length && !full) {
      const key = missing[next++]
      const res = await get(tileUrl.replace('{z}/{x}/{y}', key))
      const data = await res.arrayBuffer()
      if (progress.bytes + data.byteLength > MAX_BYTES) {
        full = true
        break
      }
      progress.bytes += data.byteLength
      await db.mapTiles.put({ key, data } satisfies MapTile)
      progress.done++
      onProgress({ ...progress })
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))

  const tiles = await db.mapTiles.where('key').anyOf(area.tiles).toArray()
  await db.mapAreas.put({
    tripId,
    // Only what is on the device: places beyond it show "outside the downloaded map".
    tiles: tiles.map((t) => t.key),
    bytes: tiles.reduce((sum, t) => sum + t.data.byteLength, 0),
    downloadedAt: new Date().toISOString(),
    detailZoom: MAX_TILE_ZOOM,
  })
  return !full
}

/** Removes a trip's offline map, and the tiles no other trip uses. */
export async function deleteTripMap(tripId: string): Promise<void> {
  await db.transaction('rw', db.mapAreas, db.mapTiles, async () => {
    await db.mapAreas.delete(tripId)
    const used = new Set((await db.mapAreas.toArray()).flatMap((a) => a.tiles))
    await db.mapTiles.filter((t) => !used.has(t.key)).delete()
  })
}

/** Download order: lower zooms first; within a zoom, the tiles closest to a place first. */
function tileOrder(key: string, points: LatLng[]): number {
  const [z, x, y] = key.split('/').map(Number)
  const n = 2 ** z
  const lng = ((x + 0.5) / n) * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n))) * 180) / Math.PI
  const km = Math.min(...points.map((p) => distanceKm(p, { lat, lng })))
  return z * 100_000 + km
}

/** "sprite/ofm_f384/ofm@2x.png" for an OpenFreeMap asset URL. */
export function assetKey(url: string): string {
  return url.replace(`${BASE}/sprites/`, 'sprite/')
}
