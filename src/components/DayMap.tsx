import { AdvancedMarker, Map, useMap, type MapMouseEvent } from '@vis.gl/react-google-maps'
import { useEffect, useMemo } from 'react'
import { legKey } from '../db/legs'
import { baseIcon } from '../db/stays'
import type { Leg, Place, Stay } from '../db/model'
import { drawingPoints, type Drawing } from '../drawing'
import { segmentColor } from '../format'
import { placePinSvg, SOLID_LINE, UNDEFINED_LINE, WALK_DOT, WALK_DOT_OUTER } from '../mapLines'
import type { LatLng } from '../routing/types'
import { useIsDark } from '../theme'

export const DAY_MAP_ID = 'day-map'

const TOKYO = { lat: 35.6812, lng: 139.7671 }

interface Props {
  places: Place[]
  /** Legs by legKey(from, to). */
  legs: Map<string, Leg>
  selectedPlaceId: string | null
  onSelectPlace: (id: string) => void
  onMapClick: (event: MapMouseEvent) => void
  /** Where to look when the day has no places yet. */
  fallbackCenter?: { lat: number; lng: number }
  /** Segment being drawn by hand, if any. */
  drawing?: Drawing | null
  /** Bases of the day's cities (hotel, station…), shown with their own pin. Two on a travel day. */
  bases?: Base[]
}

type Base = NonNullable<Stay['base']> & { city: string }

export function DayMap({ places, legs, selectedPlaceId, onSelectPlace, onMapClick, fallbackCenter, drawing, bases = [] }: Props) {
  const dark = useIsDark()
  return (
    <div className="day-map">
      <Map
        id={DAY_MAP_ID}
        mapId="DEMO_MAP_ID"
        colorScheme={dark ? 'DARK' : 'LIGHT'}
        defaultCenter={fallbackCenter ?? TOKYO}
        defaultZoom={13}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        clickableIcons
        onClick={onMapClick}
      >
        {places.map((place, i) => (
          <AdvancedMarker
            key={place.id}
            position={{ lat: place.lat, lng: place.lng }}
            title={place.name}
            zIndex={place.id === selectedPlaceId ? 1000 : i}
            onClick={() => onSelectPlace(place.id)}
          >
            {/* The same pin as on the offline map; selected = bigger, thick ring in the walking dots' blue. */}
            <span
              className="map-pin"
              dangerouslySetInnerHTML={{ __html: placePinSvg(String(i + 1), { selected: place.id === selectedPlaceId }) }}
            />
          </AdvancedMarker>
        ))}
        {bases.map((base) => (
          <AdvancedMarker key={`${base.city}|${base.lat},${base.lng}`} position={base} title={`Base in ${base.city}: ${base.name}`} zIndex={-1}>
            <span className="base-pin" aria-hidden="true">
              {baseIcon(base)}
            </span>
          </AdvancedMarker>
        ))}
        <LegLines places={places} legs={legs} />
        {drawing && <DraftLayer drawing={drawing} />}
        <FitToPlaces places={[...places, ...bases]} />
      </Map>
    </div>
  )
}

/**
 * Draws each leg between consecutive places: segments with a path in their
 * mode's style (walking dotted, transit in the line color), otherwise a thin
 * dashed straight line meaning "route not defined yet".
 */
function LegLines({ places, legs }: { places: Place[]; legs: Map<string, Leg> }) {
  const map = useMap(DAY_MAP_ID)
  useEffect(() => {
    if (!map) return
    const lines: google.maps.Polyline[] = []
    for (let i = 0; i < places.length - 1; i++) {
      const from = places[i]
      const to = places[i + 1]
      const drawn = (legs.get(legKey(from.id, to.id))?.segments ?? []).filter((s) => s.path.length > 1)
      if (drawn.length === 0) {
        lines.push(undefinedLine(map, [from, to]))
        continue
      }
      for (const segment of drawn) {
        const color = segmentColor(segment)
        lines.push(
          segment.mode === 'walk'
            ? walkingLine(map, segment.path, color)
            : solidLine(map, segment.path, color),
        )
      }
    }
    return () => lines.forEach((line) => line.setMap(null))
  }, [map, places, legs])
  return null
}

/** The hand-drawn segment in progress: its line and the points placed so far. */
function DraftLayer({ drawing }: { drawing: Drawing }) {
  const map = useMap(DAY_MAP_ID)
  const path = useMemo(() => drawing.snapped?.path ?? drawingPoints(drawing), [drawing])
  const color = segmentColor(drawing)

  useEffect(() => {
    if (!map || path.length < 2) return
    const line =
      drawing.mode === 'walk'
        ? walkingLine(map, path, color)
        : solidLine(map, path, color)
    return () => line.setMap(null)
  }, [map, path, color, drawing.mode])

  return (
    <>
      {drawing.start && (
        <AdvancedMarker position={drawing.start} zIndex={2000}>
          <span className="draft-dot start" />
        </AdvancedMarker>
      )}
      {drawing.taps.map((tap, i) => (
        <AdvancedMarker key={i} position={tap} zIndex={2000}>
          <span className="draft-dot" />
        </AdvancedMarker>
      ))}
      {drawing.end && (
        <AdvancedMarker position={drawing.end} zIndex={2000}>
          <span className="draft-dot end" />
        </AdvancedMarker>
      )}
    </>
  )
}

// All lines are non-clickable: otherwise they swallow taps meant for the map
// (adding places, drawing points).

// Same look as the offline map: see mapLines.ts.

function solidLine(map: google.maps.Map, path: LatLng[], color: string) {
  return new google.maps.Polyline({
    map,
    path,
    clickable: false,
    strokeColor: color,
    strokeOpacity: SOLID_LINE.opacity,
    strokeWeight: SOLID_LINE.width,
  })
}

/** Round dots with a white rim and a soft dark edge, readable over streets of any color. */
function walkingLine(map: google.maps.Map, path: LatLng[], color: string) {
  const repeat = `${WALK_DOT.spacing}px`
  return new google.maps.Polyline({
    map,
    path,
    clickable: false,
    strokeOpacity: 0,
    icons: [
      // Edge first, then the dot on top (same offset and repeat, so they line up).
      {
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: WALK_DOT_OUTER, fillColor: '#000000', fillOpacity: 0.35, strokeOpacity: 0 },
        offset: '0',
        repeat,
      },
      {
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: WALK_DOT.radius,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeOpacity: 1,
          strokeWeight: WALK_DOT.rim,
        },
        offset: '0',
        repeat,
      },
    ],
  })
}

/** "Route not defined yet": short dashes. */
function undefinedLine(map: google.maps.Map, path: LatLng[]) {
  const { color, opacity, width, dash, gap } = UNDEFINED_LINE
  return new google.maps.Polyline({
    map,
    path: path.map((p) => ({ lat: p.lat, lng: p.lng })),
    clickable: false,
    strokeOpacity: 0,
    icons: [
      {
        icon: { path: `M 0,0 0,${dash / width}`, strokeOpacity: opacity, strokeColor: color, strokeWeight: width, scale: width },
        offset: '0',
        repeat: `${dash + gap}px`,
      },
    ],
  })
}

/** Fits the map to the places (and bases) whenever their set changes (not on edits). */
function FitToPlaces({ places }: { places: (LatLng & { id?: string })[] }) {
  const map = useMap(DAY_MAP_ID)
  const key = places.map((p) => `${p.id ?? ''}:${p.lat},${p.lng}`).sort().join('|')
  useEffect(() => {
    if (!map || places.length === 0) return
    if (places.length === 1) {
      map.panTo({ lat: places[0].lat, lng: places[0].lng })
      return
    }
    const bounds = new google.maps.LatLngBounds()
    places.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }))
    map.fitBounds(bounds, 48)
    // Only refit when places are added, removed or moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])
  return null
}
