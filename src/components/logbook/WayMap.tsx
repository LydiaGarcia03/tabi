import { APILoadingStatus, useApiLoadingStatus } from '@vis.gl/react-google-maps'
import { useLiveQuery } from 'dexie-react-hooks'
import { lazy, Suspense } from 'react'
import type { RouteStop } from '../../db/baseStops'
import { db } from '../../db/db'
import { legKey } from '../../db/legs'
import type { Leg, Place, StayBase } from '../../db/model'
import type { LegFocus } from '../../drawing'
import { distanceKm } from '../../geo'
import { formatDistance, type Position } from '../../location'
import { useOnline } from '../../useOnline'
import { DayMap } from '../DayMap'
import { ErrorBoundary } from '../ErrorBoundary'
import { Icon } from '../Icon'
import { RouteTimeline } from '../RouteTimeline'

// MapLibre is big: loaded only when the offline map is used (and precached for offline).
const OfflineMapPanel = lazy(() => import('../OfflineMap').then((m) => ({ default: m.OfflineMapPanel })))

/** Where you're going (the nearest place, or the next one once you're at a place) and where that way starts. */
export interface Way {
  /** The stop before it in the day's route (a place, or the hotel for "From base"); none for the day's first stop. */
  from?: RouteStop
  to: RouteStop
}

const noop = () => {}

/**
 * The Logbook's map (User's choice 1A from a mock, 2026-10-28): the way to a place like an open leg on the day
 * page, plus your GPS dot and a dashed straight line from you to it. The trip's offline map when it is on this
 * device (works in airplane mode), else the Google map while online.
 */
export function WayMap({
  tripId,
  hasGoogleKey,
  way,
  places,
  route,
  legs,
  bases,
  position,
  withSteps,
}: {
  tripId: string
  hasGoogleKey: boolean
  way: Way
  /** The day's places in order (pins are numbered like the day). */
  places: Place[]
  route: RouteStop[]
  legs: Map<string, Leg>
  bases: (StayBase & { city: string })[]
  position: Position | null
  /** Phones: the planned steps under the map (wide screens show them on the card above). */
  withSteps?: boolean
}) {
  const online = useOnline()
  const status = useApiLoadingStatus()
  const area = useLiveQuery(async () => (await db.mapAreas.get(tripId)) ?? null, [tripId])
  if (area === undefined) return null

  const { from, to } = way
  const leg = from && legs.get(legKey(from.id, to.id))
  const distance = position ? distanceKm(position, to) * 1000 : null
  // Zoom to both ends, the planned steps and you, once (when the way changes, not as you move).
  const focus: LegFocus = {
    fromId: from?.id ?? to.id,
    toId: to.id,
    points: [...(from ? [from] : []), to, ...(leg?.segments.flatMap((s) => s.path) ?? []), ...(position ? [position] : [])],
  }
  const mapProps = {
    places,
    legs,
    route,
    bases,
    focus,
    selectedPlaceId: to.baseStop ? null : to.id,
    onSelectPlace: noop,
    you: position ? { position, target: to } : undefined,
  }
  const unavailable = (
    <p className="muted small way-map-missing">
      {online
        ? 'The map needs the Google key here, or the offline map.'
        : "No map without internet: download the offline map (on this page or a day's page) while you have internet."}
    </p>
  )

  return (
    <div className="way-map">
      {area ? (
        <ErrorBoundary fallback={<p className="error">The offline map failed to load. Reload the page to try again.</p>}>
          <Suspense fallback={<p className="muted small">Loading the offline map…</p>}>
            <OfflineMapPanel tripId={tripId} onTap={noop} compact {...mapProps} />
          </Suspense>
        </ErrorBoundary>
      ) : hasGoogleKey && (online || status === APILoadingStatus.LOADED) && status !== APILoadingStatus.FAILED ? (
        // A Google map already shown is kept when the connection drops.
        <ErrorBoundary fallback={unavailable}>
          <DayMap onMapClick={noop} {...mapProps} />
        </ErrorBoundary>
      ) : (
        unavailable
      )}
      {withSteps && (
        // Where you're going and how (User, 2026-10-28): the destination, then the planned way like on the day page.
        <div className="way-steps">
          <p className="way-to">
            <Icon name={to.baseStop ? 'home' : 'pin'} size={18} />
            <span>
              <strong>{to.baseStop ? `Back to base · ${to.name}` : to.name}</strong>
              {(distance != null || to.plannedTime) && (
                <span className="muted small">
                  {[distance != null && `${formatDistance(distance)} from you`, to.plannedTime && `arrive at ${to.plannedTime}`].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
          </p>
          {from && leg?.segments.length ? (
            <RouteTimeline
              segments={leg.segments}
              start={{ name: from.name, icon: from.baseStop ? 'home' : 'pin' }}
              end={{ name: to.name, icon: to.baseStop ? 'home' : 'pin' }}
            />
          ) : (
            <p className="muted small">
              {from ? "The way there isn't planned yet: follow the dashed line, straight from you." : 'First place of the day: follow the dashed line, straight from you.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
