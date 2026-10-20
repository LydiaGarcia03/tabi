import { AdvancedMarker, Map, Pin, useMap } from '@vis.gl/react-google-maps'
import { useEffect } from 'react'
import type { LatLng, RouteOption } from '../routing/types'
import { MODE_COLOR } from './format'

interface Props {
  origin: LatLng
  destination: LatLng
  option: RouteOption | null
}

export function RouteMap({ origin, destination, option }: Props) {
  return (
    <div className="map">
      <Map
        mapId="DEMO_MAP_ID"
        defaultCenter={{ lat: (origin.lat + destination.lat) / 2, lng: (origin.lng + destination.lng) / 2 }}
        defaultZoom={13}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
      >
        <AdvancedMarker position={origin} title="Start">
          <Pin background="#16a34a" borderColor="#14532d" glyphColor="#fff" />
        </AdvancedMarker>
        <AdvancedMarker position={destination} title="Goal">
          <Pin background="#b5332e" borderColor="#7f1d1d" glyphColor="#fff" />
        </AdvancedMarker>
        <RouteLines option={option} />
      </Map>
    </div>
  )
}

/** Draws the option's polylines (walking dashed) and fits the map to them. */
function RouteLines({ option }: { option: RouteOption | null }) {
  const map = useMap()

  useEffect(() => {
    if (!map || !option) return
    const bounds = new google.maps.LatLngBounds()
    const polylines = option.lines.map((line) => {
      line.path.forEach((p) => bounds.extend(p))
      const color = line.color ?? (line.mode ? MODE_COLOR[line.mode] : '#2563eb')
      const dashed = line.mode === 'walk'
      return new google.maps.Polyline({
        map,
        path: line.path,
        strokeColor: color,
        strokeOpacity: dashed ? 0 : 0.9,
        strokeWeight: 5,
        icons: dashed
          ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: color, scale: 3 }, offset: '0', repeat: '12px' }]
          : undefined,
      })
    })
    if (!bounds.isEmpty()) map.fitBounds(bounds, 40)
    return () => polylines.forEach((p) => p.setMap(null))
  }, [map, option])

  return null
}
