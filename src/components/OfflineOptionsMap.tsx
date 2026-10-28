import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Place } from '../db/model'
import { baseMarkerSvg } from '../db/stays'
import { matchPlaces, type OsmMatch } from '../offlineMap/match'
import { offlineStyle, registerOfflineProtocol } from '../offlineMap/style'
import { useIsDark } from '../theme'
import { OptionPin, type OptionsCanvasProps } from './OptionsMap'

/**
 * The options map without internet: the trip's offline map (OpenStreetMap, downloaded on the day page),
 * with the same pins as the Google one. Options from Google are shown at OpenStreetMap's position when
 * found there (like the day's offline map), else at Google's (dashed ring).
 */
export function OfflineOptionsMap({
  items,
  base,
  baseOption,
  trip,
  photos,
  inPlan,
  activeId,
  covered,
  floatingTip,
  onPinClick,
  onHover,
  onMapClick,
  apiRef,
}: OptionsCanvasProps) {
  const dark = useIsDark()
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [missing, setMissing] = useState(false)
  const [matches, setMatches] = useState<Map<string, OsmMatch | null> | null>(null)
  // Pin elements by option id (MapLibre markers); the pins are drawn into them by React.
  const [elements, setElements] = useState<Map<string, HTMLElement>>(new Map())
  // Latest handlers and items, read by the map's and markers' listeners.
  const latest = useRef({ items, onPinClick, onHover, onMapClick })
  useEffect(() => {
    latest.current = { items, onPinClick, onHover, onMapClick }
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
      m.on('load', () => setMap(m))
      m.on('click', () => latest.current.onMapClick())
      created = m
    })
    return () => {
      cancelled = true
      created?.remove()
      setMap(null)
    }
  }, [dark])

  // Keep the map sized to its box (the drawer's area is measured after the first render).
  useEffect(() => {
    if (!map || !container.current) return
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [map])

  useEffect(() => {
    if (!map) return
    apiRef.current = {
      // Offset upward: the point lands in the middle of the part above the drawer.
      reveal: (point, hidden) => map.easeTo({ center: [point.lng, point.lat], offset: [0, -hidden / 2] }),
    }
    return () => {
      apiRef.current = null
    }
  }, [map, apiRef])

  // Look the Google options up in the downloaded data, again only when the options change.
  const optionsKey = items.map((i) => `${i.option.id}:${i.option.name}:${i.option.lat},${i.option.lng}`).join('|')
  useEffect(() => {
    let stale = false
    const asPlaces = items.map((i) => ({ id: i.option.id, name: i.option.name, lat: i.option.lat!, lng: i.option.lng!, googlePlaceId: i.option.googlePlaceId }) as Place)
    void matchPlaces(asPlaces).then((m) => !stale && setMatches(m))
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey])

  const shown = items.map((item) => {
    const m = matches?.get(item.option.id)
    return { item, lat: m?.lat ?? item.option.lat!, lng: m?.lng ?? item.option.lng!, approximate: !!item.option.googlePlaceId && matches !== null && !m }
  })

  // One marker per option (and the base), rebuilt only when positions change.
  const positionsKey = JSON.stringify([shown.map((s) => [s.item.option.id, s.lat, s.lng]), base && [base.lat, base.lng], baseOption?.option.id])
  useEffect(() => {
    if (!map) return
    const byId = new Map<string, HTMLElement>()
    const markers = shown.map(({ item, lat, lng }) => {
      const id = item.option.id
      const el = document.createElement('div')
      el.addEventListener('click', (e) => {
        e.stopPropagation() // Not a tap on the map.
        const current = latest.current.items.find((i) => i.option.id === id)
        if (current) latest.current.onPinClick(current.option)
      })
      el.addEventListener('mouseenter', () => latest.current.onHover?.(id))
      el.addEventListener('mouseleave', () => latest.current.onHover?.(null))
      byId.set(id, el)
      return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map)
    })
    if (base && !baseOption) {
      const el = document.createElement('span')
      el.className = 'base-pin'
      el.innerHTML = baseMarkerSvg(base)
      el.title = `Base: ${base.name}`
      markers.push(new maplibregl.Marker({ element: el }).setLngLat([base.lng, base.lat]).addTo(map))
    }
    setElements(byId)
    return () => markers.forEach((m) => m.remove())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, positionsKey])

  // The highlighted pin on top, then the ones in the itinerary (MapLibre leaves z-index to us).
  useEffect(() => {
    for (const [id, el] of elements) {
      const option = items.find((i) => i.option.id === id)?.option
      el.style.zIndex = id === activeId ? '10' : option && inPlan(option) ? '2' : '1'
    }
  })

  // Fit the city's options when the set shown changes, not when one is highlighted.
  const fitKey = [...items.map((i) => i.option.id), base ? `${base.lat},${base.lng}` : ''].sort().join('|')
  useEffect(() => {
    if (!map) return
    const points = [...items.map((i) => ({ lat: i.option.lat!, lng: i.option.lng! })), ...(base ? [base] : [])]
    if (points.length === 0) return
    if (points.length === 1) {
      map.easeTo({ center: [points[0].lng, points[0].lat], zoom: 15, offset: [0, -covered / 2], duration: 0 })
      return
    }
    const bounds = new maplibregl.LngLatBounds()
    points.forEach((p) => bounds.extend([p.lng, p.lat]))
    map.fitBounds(bounds, { padding: { top: 48, left: 32, right: 32, bottom: covered + 32 }, maxZoom: 16, duration: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey])

  if (missing) return <p className="error">The offline map files are missing: update the offline map on a day page.</p>
  return (
    <>
      <div ref={container} className="offline-options-map" />
      {shown.map(({ item, approximate }) => {
        const el = elements.get(item.option.id)
        if (!el) return null
        const { option } = item
        return createPortal(
          <OptionPin
            item={item}
            base={base}
            isBase={option.id === baseOption?.option.id}
            trip={trip}
            images={photos.get(option.id) ?? []}
            planned={inPlan(option)}
            active={option.id === activeId}
            floatingTip={floatingTip}
            approximate={approximate}
          />,
          el,
          option.id,
        )
      })}
    </>
  )
}
