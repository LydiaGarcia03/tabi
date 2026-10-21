// Turns a downloaded OpenFreeMap style into one that reads everything from
// this device, through the "tabi-offline://" protocol.

import { addProtocol, setWorkerUrl, type StyleSpecification } from 'maplibre-gl'
// MapLibre draws in a Web Worker shipped as a separate file (bundled and precached for offline).
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { db } from '../db/db'
import { MAX_TILE_ZOOM } from './area'
import { assetKey, STYLE } from './download'
import { enrichStyle } from './richStyle'

const PROTOCOL = 'tabi-offline'
const EMPTY = new ArrayBuffer(0)
// Required by the OpenStreetMap (ODbL) and OpenMapTiles licenses.
const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">© OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'

let registered = false

/** Serves tiles, fonts and icons from IndexedDB. A missing tile is drawn empty. */
export function registerOfflineProtocol(): void {
  if (registered) return
  registered = true
  setWorkerUrl(workerUrl)
  addProtocol(PROTOCOL, async ({ url }) => {
    const path = decodeURIComponent(url.slice(`${PROTOCOL}://`.length))
    if (path.startsWith('tile/')) {
      const tile = await db.mapTiles.get(path.slice('tile/'.length))
      return { data: tile?.data ?? EMPTY }
    }
    const asset = await db.mapAssets.get(path)
    if (path.startsWith('font/')) return { data: asset?.data ?? EMPTY }
    if (!asset) throw new Error(`Offline map file missing: ${path}`)
    // Sprite index files are JSON; MapLibre expects them parsed.
    return { data: path.endsWith('.json') ? JSON.parse(asset.data as string) : asset.data }
  })
}

/** The offline style (dark mode: the same one darkened), or null when it hasn't been downloaded. */
export async function offlineStyle(dark: boolean): Promise<StyleSpecification | null> {
  const stored = await db.mapAssets.get(`style/${STYLE}`)
  if (!stored) return null
  const style = JSON.parse(stored.data as string) as StyleSpecification
  // Only the OpenStreetMap vector data; the shaded-relief raster (online only) is dropped.
  const raster = new Set(Object.entries(style.sources).filter(([, s]) => s.type !== 'vector').map(([id]) => id))
  for (const id of raster) delete style.sources[id]
  style.layers = style.layers.filter((l) => !('source' in l) || !raster.has(l.source as string))
  for (const id of Object.keys(style.sources)) {
    style.sources[id] = {
      type: 'vector',
      tiles: [`${PROTOCOL}://tile/{z}/{x}/{y}`],
      minzoom: 0,
      maxzoom: MAX_TILE_ZOOM,
      attribution: ATTRIBUTION,
    }
  }
  style.glyphs = `${PROTOCOL}://font/{fontstack}/{range}`
  if (typeof style.sprite === 'string') style.sprite = `${PROTOCOL}://${assetKey(style.sprite)}`
  return enrichStyle(style, dark)
}
