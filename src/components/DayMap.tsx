import { AdvancedMarker, Map, Pin, useMap, type MapMouseEvent } from '@vis.gl/react-google-maps'
import { useEffect } from 'react'
import type { Place } from '../db/model'

export const DAY_MAP_ID = 'day-map'

const TOKYO = { lat: 35.6812, lng: 139.7671 }

interface Props {
  places: Place[]
  selectedPlaceId: string | null
  onSelectPlace: (id: string) => void
  onMapClick: (event: MapMouseEvent) => void
  /** Where to look when the day has no places yet. */
  fallbackCenter?: { lat: number; lng: number }
}

export function DayMap({ places, selectedPlaceId, onSelectPlace, onMapClick, fallbackCenter }: Props) {
  return (
    <div className="day-map">
      <Map
        id={DAY_MAP_ID}
        mapId="DEMO_MAP_ID"
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
            <Pin
              background={place.id === selectedPlaceId ? '#1f1d1a' : '#b5332e'}
              borderColor="#7f1d1d"
              glyphColor="#fff"
              glyphText={String(i + 1)}
            />
          </AdvancedMarker>
        ))}
        <VisitOrderLine places={places} />
        <FitToPlaces places={places} />
      </Map>
    </div>
  )
}

/** Thin dashed line in visiting order (real routes come with legs in Phase 3). */
function VisitOrderLine({ places }: { places: Place[] }) {
  const map = useMap(DAY_MAP_ID)
  useEffect(() => {
    if (!map || places.length < 2) return
    const line = new google.maps.Polyline({
      map,
      path: places.map((p) => ({ lat: p.lat, lng: p.lng })),
      strokeOpacity: 0,
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.6, strokeColor: '#7f1d1d', scale: 2 }, offset: '0', repeat: '10px' }],
    })
    return () => line.setMap(null)
  }, [map, places])
  return null
}

/** Fits the map to the places whenever the set of places changes (not on edits). */
function FitToPlaces({ places }: { places: Place[] }) {
  const map = useMap(DAY_MAP_ID)
  const key = places.map((p) => `${p.id}:${p.lat},${p.lng}`).sort().join('|')
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
