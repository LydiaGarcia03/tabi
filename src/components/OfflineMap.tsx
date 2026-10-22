import { useLiveQuery } from 'dexie-react-hooks'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../db/db'
import { legKey } from '../db/legs'
import type { Leg, Place, StayBase } from '../db/model'
import { baseMarkerSvg } from '../db/stays'
import { drawingPoints, type Drawing } from '../drawing'
import { segmentColor } from '../format'
import { drawWalkDot, placePinSvg, SOLID_LINE, UNDEFINED_LINE, WALK_DOT } from '../mapLines'
import { areaTiles, isCovered } from '../offlineMap/area'
import { deleteTripMap, downloadTripMap, type Progress } from '../offlineMap/download'
import { matchPlaces, type OsmMatch } from '../offlineMap/match'
import { offlineStyle, registerOfflineProtocol } from '../offlineMap/style'
import type { LatLng } from '../routing/types'
import { useIsDark } from '../theme'
import { useOnline } from '../useOnline'

type Base = StayBase & { city: string }

interface Props {
  tripId: string
  places: Place[]
  legs: Map<string, Leg>
  selectedPlaceId: string | null
  onSelectPlace: (id: string) => void
  /** A tap on the map; `name` when it was on a point of interest. */
  onTap: (tap: LatLng & { name?: string }) => void
  drawing?: Drawing | null
  bases?: Base[]
  /** The places with the day's "back to base" stops, for the leg lines (default: the places). */
  route?: Place[]
}

/** Where a place is drawn on the offline map, and why. */
type Shown = Place & { source: 'osm' | 'google' | 'own'; osmName?: string }

/**
 * The day map drawn from OpenStreetMap data saved on this device: works
 * without internet. Google places are first looked up in that data; those
 * not found keep Google's position (dashed pins).
 */
export function OfflineMapPanel({ tripId, places, bases = [], ...mapProps }: Props) {
  const online = useOnline()
  const area = useLiveQuery(async () => (await db.mapAreas.get(tripId)) ?? null, [tripId])
  const tripPoints = useLiveQuery(async () => {
    const [all, stays] = await Promise.all([db.places.where('tripId').equals(tripId).toArray(), db.stays.where('tripId').equals(tripId).toArray()])
    return [...all, ...stays.flatMap((s) => (s.base ? [s.base] : []))].map((p) => ({ lat: p.lat, lng: p.lng }))
  }, [tripId])
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)
  const [matches, setMatches] = useState<Map<string, OsmMatch | null> | null>(null)

  const placesKey = places.map((p) => `${p.id}:${p.name}:${p.lat},${p.lng}`).join('|')
  useEffect(() => {
    if (!area) return
    let stale = false
    void matchPlaces(places).then((m) => !stale && setMatches(m))
    return () => {
      stale = true
    }
    // Look up again only when the places (or the downloaded area) change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, placesKey])

  async function download() {
    setError('')
    abort.current = new AbortController()
    try {
      const complete = await downloadTripMap(tripId, tripPoints ?? [], setProgress, abort.current.signal)
      if (!complete) {
        setError("The 50 MB limit of one download was reached: the areas farthest from your places were left out (marked if a place is there).")
      }
    } catch (err) {
      if (!abort.current.signal.aborted) setError(err instanceof Error ? err.message : String(err))
    } finally {
      setProgress(null)
    }
  }

  if (area === undefined || tripPoints === undefined) return null
  const estimate = areaTiles(tripPoints)

  const downloader = (
    <>
      {progress ? (
        <div className="offline-progress">
          <span className="small">
            Downloading the map… {progress.done} / {progress.total} tiles ({(progress.bytes / 1024 / 1024).toFixed(1)} MB)
          </span>
          <span className="progress">
            <span style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
          </span>
          <button type="button" onClick={() => abort.current?.abort()}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className={area ? '' : 'primary'} disabled={!online || !estimate} onClick={download}>
          {area ? 'Update the offline map' : 'Download the offline map for this trip'}
        </button>
      )}
      {!online && <span className="muted small"> (needs internet)</span>}
      {error && <p className="error small">{error}</p>}
    </>
  )

  if (!area) {
    return (
      <div className="card offline-map-setup">
        <p>
          <strong>Offline map (OpenStreetMap)</strong>
        </p>
        <p className="muted small">
          Download it once with internet: the area around every place and city base of this trip
          {estimate ? ` (about ${estimate.tiles.length} map tiles, up to 50 MB)` : ''} is saved on this device and then works
          without internet. Free, from OpenFreeMap.
        </p>
        {downloader}
      </div>
    )
  }

  const covered = new Set(area.tiles)
  const outside = places.filter((p) => !isCovered(covered, p))
  const shown: Shown[] = places.map((p) => {
    if (!p.googlePlaceId) return { ...p, source: 'own' }
    const m = matches?.get(p.id)
    return m ? { ...p, lat: m.lat, lng: m.lng, source: 'osm', osmName: m.name } : { ...p, source: 'google' }
  })
  const googleCount = shown.filter((p) => p.source !== 'own').length
  const fromGoogle = shown.filter((p) => p.source === 'google')

  return (
    <>
      <OfflineDayMap places={shown} bases={bases} {...mapProps} />
      <div className="offline-map-status small">
        {matches === null ? (
          <span className="muted">Looking up the places in OpenStreetMap…</span>
        ) : (
          googleCount > 0 && (
            <span>
              {googleCount - fromGoogle.length} of {googleCount} places found in OpenStreetMap
              {fromGoogle.length > 0 && (
                <span className="muted">
                  {' '}
                  · shown at Google's position (dashed): {fromGoogle.map((p) => p.name).join(', ')}
                </span>
              )}
            </span>
          )
        )}
        {outside.length > 0 && (
          <span className="warning"> · {outside.length === 1 ? '1 place is' : `${outside.length} places are`} outside the downloaded map: update it.</span>
        )}
        <details className="offline-map-manage">
          <summary>Offline map: {(area.bytes / 1024 / 1024).toFixed(1)} MB, {formatAge(area.downloadedAt)}</summary>
          <p className="muted small">
            Update it after adding places in new areas. The map shows detail up to street level around your places and
            cities; elsewhere it gets coarser.
          </p>
          <div className="row wrap">
            {downloader}
            <button type="button" className="danger-outline" disabled={!!progress} onClick={() => void deleteTripMap(tripId)}>
              Delete it from this device
            </button>
          </div>
        </details>
      </div>
    </>
  )
}

function formatAge(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  return days === 0 ? 'downloaded today' : `downloaded ${days} ${days === 1 ? 'day' : 'days'} ago`
}

const LEGS_SOURCE = 'tabi-legs'
const DRAFT_SOURCE = 'tabi-draft'

function OfflineDayMap({
  places,
  legs,
  selectedPlaceId,
  onSelectPlace,
  onTap,
  drawing,
  bases = [],
  route,
}: Omit<Props, 'tripId' | 'places'> & { places: Shown[] }) {
  const dark = useIsDark()
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [missing, setMissing] = useState(false)
  // Latest handlers, read by the map's click listener.
  const handlers = useRef({ onTap, onSelectPlace })
  useEffect(() => {
    handlers.current = { onTap, onSelectPlace }
  })

  // The map is rebuilt when light/dark mode changes (each has its own style).
  useEffect(() => {
    let created: MapLibreMap | null = null
    let cancelled = false
    registerOfflineProtocol()
    void offlineStyle(dark).then((style) => {
      if (cancelled || !container.current) return
      if (!style) return setMissing(true)
      const m = new maplibregl.Map({
        container: container.current,
        style,
        center: [139.7671, 35.6812],
        zoom: 12,
        maxZoom: 19,
        // Kanji and kana are drawn with the phone's fonts (nothing to download).
        localIdeographFontFamily: 'sans-serif',
        attributionControl: { compact: true },
      })
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      // Your position on the map (GPS: works offline).
      m.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), 'top-right')
      // Walking dots are images drawn like Google's circles, one per color, made when first needed.
      m.setMissingStyleImageResolver((id) => {
        if (!id.startsWith(DOT_PREFIX) || m.hasImage(id)) return
        m.addImage(id, drawWalkDot(id.slice(DOT_PREFIX.length), 2), { pixelRatio: 2 })
      })
      m.on('load', () => {
        // Saved legs, then the segment being drawn on top: same styles for both.
        for (const source of [LEGS_SOURCE, DRAFT_SOURCE]) {
          m.addSource(source, { type: 'geojson', data: emptyCollection() })
          addLegLayers(m, source)
        }
        setMap(m)
      })
      m.on('click', (e) => {
        // A point of interest under the finger gives its name (e.g. a shop to add as a pin).
        const poiLayers = m.getStyle().layers.filter((l) => 'source-layer' in l && l['source-layer'] === 'poi').map((l) => l.id)
        const feature = poiLayers.length ? m.queryRenderedFeatures(e.point, { layers: poiLayers })[0] : undefined
        const props = feature?.properties ?? {}
        const name = [props['name:latin'] ?? props.name_en, props['name:nonlatin']].filter(Boolean).join(' ') || props.name
        handlers.current.onTap({ lat: e.lngLat.lat, lng: e.lngLat.lng, name: typeof name === 'string' && name ? name : undefined })
      })
      created = m
    })
    return () => {
      cancelled = true
      created?.remove()
      setMap(null)
    }
  }, [dark])

  // Keep the map sized to its box (it is hidden with CSS by "Hide map").
  useEffect(() => {
    if (!map || !container.current) return
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [map])

  // Place pins (numbered) and city bases, rebuilt only when what they show changes.
  const pinsKey = JSON.stringify([places.map((p) => [p.id, p.lat, p.lng, p.name, p.source, p.osmName]), bases, selectedPlaceId])
  useEffect(() => {
    if (!map) return
    const markers = places.map((place, i) => {
      // The same pin as on the Google map (a span: the app's button styles would change its colors).
      const el = document.createElement('span')
      el.setAttribute('role', 'button')
      el.className = 'map-pin'
      // Selected: bigger, thick ring in the walking blue; dashed when the position came from Google.
      el.innerHTML = placePinSvg(String(i + 1), { selected: place.id === selectedPlaceId, dashed: place.source === 'google' })
      el.title =
        place.source === 'google' ? `${place.name} (position from Google: not found in OpenStreetMap)` : place.osmName ? `${place.name} · ${place.osmName}` : place.name
      el.addEventListener('click', (e) => {
        e.stopPropagation() // Not a tap on the map.
        handlers.current.onSelectPlace(place.id)
      })
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([place.lng, place.lat]).addTo(map)
      // MapLibre sets z-index on the marker's element: keep the selected pin above the others.
      if (place.id === selectedPlaceId) el.style.zIndex = '2'
      return marker
    })
    const baseMarkers = bases.map((base) => {
      const el = document.createElement('span')
      el.className = 'base-pin'
      el.innerHTML = baseMarkerSvg(base)
      el.title = `Base in ${base.city}: ${base.name}`
      return new maplibregl.Marker({ element: el }).setLngLat([base.lng, base.lat]).addTo(map)
    })
    return () => [...markers, ...baseMarkers].forEach((m) => m.remove())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pinsKey])

  // Legs between consecutive stops (places where they are drawn, and base stops).
  const shownById = new Map(places.map((p) => [p.id, p]))
  const stops = (route ?? places).map((p) => shownById.get(p.id) ?? p)
  const legsKey = stops.map((p) => `${p.id}:${p.lat},${p.lng}`).join('|')
  useEffect(() => {
    const source = map?.getSource<GeoJSONSource>(LEGS_SOURCE)
    if (!source) return
    const features: GeoJSON.Feature[] = []
    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i]
      const to = stops[i + 1]
      const drawn = (legs.get(legKey(from.id, to.id))?.segments ?? []).filter((s) => s.path.length > 1)
      if (drawn.length === 0) {
        features.push(line([from, to], { style: 'undefined' }))
        continue
      }
      for (const s of drawn) features.push(line(s.path, { style: s.mode === 'walk' ? 'walk' : 'solid', color: segmentColor(s) }))
    }
    source.setData({ type: 'FeatureCollection', features })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, legsKey, legs])

  // The segment being drawn by hand, and its points.
  const draftPath = useMemo(() => (drawing ? (drawing.snapped?.path ?? drawingPoints(drawing)) : []), [drawing])
  useEffect(() => {
    const source = map?.getSource<GeoJSONSource>(DRAFT_SOURCE)
    if (!source || !map) return
    const color = drawing ? segmentColor(drawing) : '#000'
    const style = drawing?.mode === 'walk' ? 'walk' : 'solid'
    source.setData(draftPath.length > 1 ? { type: 'FeatureCollection', features: [line(draftPath, { style, color })] } : emptyCollection())
    const points = drawing ? [drawing.start && { p: drawing.start, c: 'start' }, ...drawing.taps.map((p) => ({ p, c: '' })), drawing.end && { p: drawing.end, c: 'end' }] : []
    const markers = points
      .filter((x): x is { p: LatLng; c: string } => !!x)
      .map(({ p, c }) => {
        const el = document.createElement('span')
        el.className = `draft-dot ${c}`
        return new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map)
      })
    return () => markers.forEach((m) => m.remove())
  }, [map, drawing, draftPath])

  // Fit the places (and bases) whenever their set changes, not on every edit.
  const fitKey = [...places.map((p) => `${p.id}:${p.lat},${p.lng}`), ...bases.map((b) => `${b.lat},${b.lng}`)].sort().join('|')
  useEffect(() => {
    if (!map) return
    const points = [...places, ...bases]
    if (points.length === 0) return
    if (points.length === 1) {
      map.easeTo({ center: [points[0].lng, points[0].lat], zoom: Math.max(map.getZoom(), 15) })
      return
    }
    const bounds = new maplibregl.LngLatBounds()
    points.forEach((p) => bounds.extend([p.lng, p.lat]))
    map.fitBounds(bounds, { padding: 48, maxZoom: 16, duration: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey])

  if (missing) return <p className="error">The offline map files are missing: update the offline map.</p>
  return <div ref={container} className="day-map offline-day-map" />
}

const DOT_PREFIX = 'tabi-dot-'

/** Leg styles, the same as on the Google map (see mapLines.ts): dashed "not defined", solid transit, walking dots. */
function addLegLayers(m: MapLibreMap, source: string) {
  const { color, opacity, width, dash, gap } = UNDEFINED_LINE
  m.addLayer({
    id: `${source}-undefined`,
    type: 'line',
    source,
    filter: ['==', ['get', 'style'], 'undefined'],
    // Dash lengths are in line widths.
    paint: { 'line-color': color, 'line-opacity': opacity, 'line-width': width, 'line-dasharray': [dash / width, gap / width] },
  })
  m.addLayer({
    id: `${source}-solid`,
    type: 'line',
    source,
    filter: ['==', ['get', 'style'], 'solid'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-opacity': SOLID_LINE.opacity, 'line-width': SOLID_LINE.width },
  })
  m.addLayer({
    id: `${source}-walk`,
    type: 'symbol',
    source,
    filter: ['==', ['get', 'style'], 'walk'],
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': WALK_DOT.spacing,
      'icon-image': ['concat', DOT_PREFIX, ['get', 'color']],
      // Every dot is drawn, even where they touch other symbols.
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-padding': 0,
    },
  })
}

function line(path: LatLng[], properties: Record<string, string>): GeoJSON.Feature {
  return { type: 'Feature', properties, geometry: { type: 'LineString', coordinates: path.map((p) => [p.lng, p.lat]) } }
}

function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}
