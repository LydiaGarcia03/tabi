// Makes OpenFreeMap's Liberty style show what a traveller needs, closer to
// Organic Maps: the tiles carry thousands of points of interest per
// neighbourhood (restaurants, konbini, toilets, subway exits…) that Liberty
// only shows from zoom 17. Also a dark version of the same style.

import type { LayerSpecification, StyleSpecification, SymbolLayerSpecification } from 'maplibre-gl'

/**
 * Which points of interest win when labels collide (lower = first), in the
 * order Organic Maps uses (data/styles/default/include/priorities_4_overlays.prio.txt):
 * transport, sights, temples and shrines, subway exits, food, groceries,
 * other shops, ATMs, toilets.
 */
const POI_PRIORITY: [string[], number][] = [
  [['railway', 'bus', 'airport', 'ferry_terminal', 'aerialway'], 0],
  [['museum', 'attraction', 'viewpoint', 'castle', 'monument', 'zoo', 'theatre', 'cinema', 'art_gallery', 'stadium'], 1],
  [['place_of_worship', 'park', 'garden'], 2],
  [['entrance'], 3],
  [['restaurant', 'cafe', 'fast_food', 'ice_cream', 'bar', 'beer'], 4],
  [['grocery', 'shop', 'bakery', 'alcohol_shop'], 5],
  [['clothing_store', 'shoe_shop', 'gift', 'jewelry', 'books', 'music', 'library', 'lodging', 'pharmacy', 'post'], 6],
  [['atm', 'bank', 'information'], 7],
  [['toilets', 'drinking_water'], 8],
]
const OTHER_PRIORITY = 9

/** POIs by importance: rank 1–6 from zoom 14, up to 19 from 15, all from 16 (Liberty: 15 / 16 / 17). */
const POI_MINZOOM: Record<string, number> = { poi_r1: 14, poi_r7: 15, poi_r20: 16 }

export function enrichStyle(style: StyleSpecification, dark: boolean): StyleSpecification {
  const sortKey = [
    '+',
    ['*', 100, ['match', ['get', 'class'], ...POI_PRIORITY.flatMap(([classes, p]) => [classes, p]), OTHER_PRIORITY]],
    ['min', 99, ['coalesce', ['get', 'rank'], 99]],
  ]
  const layers: LayerSpecification[] = []
  for (const layer of style.layers) {
    // Flat buildings at every close zoom (clearer than 3D on a phone, like Organic Maps).
    if (layer.id === 'building-3d') continue
    if (layer.id === 'building') delete layer.maxzoom
    if (layer.type === 'symbol' && layer['source-layer'] === 'poi') {
      if (layer.id in POI_MINZOOM) layer.minzoom = POI_MINZOOM[layer.id]
      layer.layout = { ...layer.layout, 'symbol-sort-key': sortKey as never, 'text-size': 12.5 }
    }
    // House numbers (Japanese block numbers like "3-16") before the points of interest.
    if (layer.id === 'poi_r20') layers.push(HOUSE_NUMBERS)
    layers.push(layer)
  }
  style.layers = dark ? layers.map(darken) : layers
  return style
}

const HOUSE_NUMBERS: SymbolLayerSpecification = {
  id: 'tabi-housenumber',
  type: 'symbol',
  source: 'openmaptiles',
  'source-layer': 'housenumber',
  minzoom: 17,
  layout: { 'text-field': ['get', 'housenumber'], 'text-font': ['Noto Sans Regular'], 'text-size': 10 },
  paint: { 'text-color': '#8a7f73', 'text-halo-color': '#ffffff', 'text-halo-width': 1 },
}

// --- Dark mode: the same style with every color's lightness flipped. -------

function darken(layer: LayerSpecification): LayerSpecification {
  if (!('paint' in layer) || !layer.paint) return layer
  const paint: Record<string, unknown> = { ...layer.paint }
  for (const [key, value] of Object.entries(paint)) {
    if (key.endsWith('color')) paint[key] = mapColors(value)
  }
  return { ...layer, paint } as LayerSpecification
}

/** Replaces every color string inside a paint value (plain or expression). */
function mapColors(value: unknown): unknown {
  if (typeof value === 'string') return flipColor(value) ?? value
  if (Array.isArray(value)) return value.map(mapColors)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapColors(v)]))
  return value
}

/** Light paper → dark ink and vice versa, keeping the hue (water stays blue, parks green). */
function flipColor(text: string): string | null {
  const parsed = parseColor(text.trim())
  if (!parsed) return null
  const [h, s, l, a] = parsed
  // Light backgrounds become dark (but not black); dark text becomes light.
  const lightness = 0.1 + (1 - l) * 0.78
  return `hsla(${Math.round(h)}, ${Math.round(s * 70)}%, ${Math.round(lightness * 100)}%, ${a})`
}

/** [hue 0–360, saturation 0–1, lightness 0–1, alpha] of a CSS color, or null for anything else. */
function parseColor(text: string): [number, number, number, number] | null {
  let m = /^#([0-9a-f]{3,8})$/i.exec(text)
  if (m) {
    let hex = m[1]
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('')
    const n = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255
    return rgbToHsl(n(0), n(2), n(4), hex.length === 8 ? n(6) : 1)
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(text)
  if (m) return rgbToHsl(+m[1] / 255, +m[2] / 255, +m[3] / 255, m[4] == null ? 1 : +m[4])
  m = /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(text)
  if (m) return [+m[1], +m[2] / 100, +m[3] / 100, m[4] == null ? 1 : +m[4]]
  return null
}

function rgbToHsl(r: number, g: number, b: number, a: number): [number, number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l, a]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l, a]
}
