import { AdvancedMarker, AdvancedMarkerAnchorPoint, APILoadingStatus, Map, useApiLoadingStatus, useMap } from '@vis.gl/react-google-maps'
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type PointerEvent, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { optionPriced, pricedTotal, travelersOf } from '../budget'
import { baseMarkerSvg } from '../db/stays'
import type { StayBase, Trip, TripOption } from '../db/model'
import { formatMoney } from '../format'
import type { Group, Scored } from '../planning/compare'
import { DAY_KINDS, KIND_ICON, KIND_PLURAL } from '../planning/optionKinds'
import { useIsDark } from '../theme'
import { useMediaQuery } from '../useMediaQuery'
import { useOnline } from '../useOnline'
import { useCityHue } from '../cityColors'
import { ErrorBoundary } from './ErrorBoundary'
import { Icon } from './Icon'
import { formatKm, ItineraryTags, type ItineraryState } from './OptionDetails'
import { BlobImage } from './Photos'
import { Stars } from './Stars'

export const OPTIONS_MAP_ID = 'options-map'

/** From this width the list and the map sit side by side; below it the list is a drawer over the map. */
export const WIDE = '(min-width: 960px)'
/** Where the drawer can rest, as a share of the map's height from its top: list almost full, half, mostly map. */
const DRAWER_STOPS = [0.1, 0.5, 0.82]

// The offline map (MapLibre) is a large download of its own: only loaded when used.
const OfflineOptionsMap = lazy(() => import('./OfflineOptionsMap').then((m) => ({ default: m.OfflineOptionsMap })))

/** Google with internet; without, the offline map (OpenStreetMap) when the trip's map was downloaded. */
export type OptionsMapProvider = 'google' | 'offline'

interface Props {
  city: string
  /** The board's groups for one city (no transport). */
  groups: Group[]
  trip: Trip
  /** The city's base (hotel, station…), if set. */
  base?: StayBase
  photos: Map<string, Blob[]>
  inPlan: (option: TripOption) => ItineraryState
  onOpen: (option: TripOption) => void
  provider: OptionsMapProvider
}

/** What the list asks of whichever map is shown. */
export interface OptionsMapApi {
  /** Centers a point in the part of the map not covered by the drawer (`covered` px at the bottom). */
  reveal: (point: { lat: number; lng: number }, covered: number) => void
}

/** What both maps (Google and offline) draw and report. */
export interface OptionsCanvasProps {
  items: Scored[]
  base?: StayBase
  /** The hotel option that is the base: drawn as the base tile. */
  baseOption?: Scored
  trip: Trip
  photos: Map<string, Blob[]>
  inPlan: (option: TripOption) => ItineraryState
  activeId: string | null
  /** Map pixels hidden under the drawer at the bottom (phones). */
  covered: number
  /** Computers: the highlighted pin's card is drawn over the page (FloatingTip), so the map's edge doesn't cut it. */
  floatingTip: boolean
  onPinClick: (option: TripOption) => void
  onHover?: (id: string | null) => void
  onMapClick: () => void
  apiRef: MutableRefObject<OptionsMapApi | null>
}

/**
 * The options of one city on a map, with the list next to it (computers) or in a
 * drawer over it (phones). Hovering (or, on a phone, tapping) an option in the list
 * or on the map highlights it in both; another tap opens its details.
 */
export function OptionsMapView({ city, groups, trip, base, photos, inPlan, onOpen, provider }: Props) {
  const wide = useMediaQuery(WIDE)
  const canHover = useMediaQuery('(hover: hover)')
  const mapApi = useRef<OptionsMapApi | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const activeId = hoverId ?? selectedId
  // The same map is kept from one city to the next (no new map load): only the highlight is reset.
  const [shownCity, setShownCity] = useState(city)
  if (city !== shownCity) {
    setShownCity(city)
    setSelectedId(null)
    setHoverId(null)
  }
  const area = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [areaHeight, setAreaHeight] = useState(0)
  const [drawerStop, setDrawerStop] = useState(1)
  const [drag, setDrag] = useState<{ startY: number; startTop: number; top: number } | null>(null)

  // Phones: the map fills the screen below the filters, above the navigation bar.
  useLayoutEffect(() => {
    if (wide) return
    const fit = () => {
      const el = area.current
      if (!el) return
      const nav = document.querySelector<HTMLElement>('.bottom-nav')
      const top = el.getBoundingClientRect().top + window.scrollY
      setAreaHeight(Math.max(380, window.innerHeight - top - (nav?.offsetHeight ?? 0)))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [wide])

  const drawerTop = drag ? drag.top : DRAWER_STOPS[drawerStop] * areaHeight
  // Map pixels hidden under the drawer (none on computers).
  const covered = wide ? 0 : Math.max(0, areaHeight - drawerTop)

  const items = groups.flatMap((g) => g.items)
  const located = items.filter((i) => i.option.lat != null && i.option.lng != null)
  const unlocated = items.length - located.length
  // A hotel picked as the base is drawn as the base (one marker, not two on the same spot).
  const baseOption = base?.optionId ? located.find((i) => i.option.id === base.optionId) : undefined
  const activeOption = activeId ? items.find((i) => i.option.id === activeId)?.option : undefined

  const select = (option: TripOption, from: 'list' | 'map') => {
    if (selectedId === option.id) return onOpen(option)
    setSelectedId(option.id)
    if (from === 'map') {
      // Bring its row into view (in the drawer or the list next to the map).
      const row = list.current?.querySelector<HTMLElement>(`[data-option="${option.id}"]`)
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    } else if (option.lat != null && option.lng != null) {
      // Into the part of the map the drawer doesn't cover.
      mapApi.current?.reveal({ lat: option.lat, lng: option.lng }, covered)
    }
  }
  // With a mouse, hovering already shows the option: a click opens it.
  const onRowClick = (option: TripOption) => (canHover ? onOpen(option) : select(option, 'list'))
  const onPinClick = (option: TripOption) => (canHover ? onOpen(option) : select(option, 'map'))

  const startDrag = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ startY: e.clientY, startTop: drawerTop, top: drawerTop })
  }
  const moveDrag = (e: PointerEvent) => {
    if (!drag) return
    const top = Math.min(areaHeight - 56, Math.max(areaHeight * DRAWER_STOPS[0], drag.startTop + e.clientY - drag.startY))
    setDrag({ ...drag, top })
  }
  const endDrag = () => {
    if (!drag) return
    if (Math.abs(drag.top - drag.startTop) < 5) {
      // A tap on the handle: open the list half-way, or put it back down.
      setDrawerStop(drawerStop === 1 ? 0 : 1)
    } else {
      const share = drag.top / areaHeight
      setDrawerStop(DRAWER_STOPS.reduce((best, stop, i) => (Math.abs(stop - share) < Math.abs(DRAWER_STOPS[best] - share) ? i : best), 0))
    }
    setDrag(null)
  }

  const canvas: OptionsCanvasProps = {
    items: located,
    base,
    baseOption,
    trip,
    photos,
    inPlan,
    activeId,
    covered,
    floatingTip: wide,
    onPinClick,
    onHover: canHover ? setHoverId : undefined,
    onMapClick: () => setSelectedId(null),
    apiRef: mapApi,
  }

  return (
    <div
      ref={area}
      className={`options-map-layout${drag ? ' dragging' : ''}`}
      style={wide ? undefined : { height: areaHeight, ['--drawer-top' as string]: `${drawerTop}px` }}
    >
      <div className="options-map-pane">
        {provider === 'google' ? (
          <OptionsMapCanvas {...canvas} />
        ) : (
          <ErrorBoundary fallback={<p className="error">The offline map failed to load. Reload the page to try again.</p>}>
            <Suspense fallback={<p className="muted small">Loading the offline map…</p>}>
              <OfflineOptionsMap {...canvas} />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>
      {wide && activeOption?.lat != null && (
        <FloatingTip key={activeOption.id} option={activeOption} trip={trip} images={photos.get(activeOption.id) ?? []} inPlan={inPlan(activeOption)} />
      )}
      <div className="options-map-list card">
        {!wide && (
          <div className="options-map-handle" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
            <span className="options-map-grip" aria-hidden="true" />
            <span className="small">
              <strong>{items.length === 1 ? '1 option' : `${items.length} options`}</strong>
              {groups[0]?.reference && <span className="muted"> · distances from {groups[0].reference.name}</span>}
            </span>
          </div>
        )}
        <div ref={list} className="options-map-rows">
          {wide && groups[0]?.reference && <p className="muted small options-map-note">Distances from {groups[0].reference.name}</p>}
          {unlocated > 0 && (
            <p className="muted small options-map-note">
              {unlocated === 1 ? "1 option isn't on the map yet" : `${unlocated} options aren't on the map yet`} (no location: Edit → Location)
            </p>
          )}
          {groups.map((group) => (
            <section key={group.key}>
              <h3 className="options-map-group">
                <Icon name={KIND_ICON[group.kind]} size={16} /> {KIND_PLURAL[group.kind]}
              </h3>
              <ul>
                {[...group.items]
                  .sort((a, b) => Number(a.option.status === 'discarded') - Number(b.option.status === 'discarded') || (b.score ?? -1) - (a.score ?? -1))
                  .map((item) => (
                    <OptionMapRow
                      key={item.option.id}
                      item={item}
                      trip={trip}
                      images={photos.get(item.option.id) ?? []}
                      inPlan={inPlan(item.option)}
                      active={item.option.id === activeId}
                      onClick={() => onRowClick(item.option)}
                      onHover={canHover ? setHoverId : undefined}
                    />
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

function OptionMapRow({
  item,
  trip,
  images,
  inPlan,
  active,
  onClick,
  onHover,
}: {
  item: Scored
  trip: Trip
  images: Blob[]
  inPlan: ItineraryState
  active: boolean
  onClick: () => void
  onHover?: (id: string | null) => void
}) {
  const { option } = item
  const located = option.lat != null && option.lng != null
  return (
    <li
      data-option={option.id}
      className={`options-map-row${active ? ' active' : ''}${option.status === 'discarded' ? ' discarded' : ''}`}
      onClick={onClick}
      onMouseEnter={onHover && (() => onHover(option.id))}
      onMouseLeave={onHover && (() => onHover(null))}
    >
      <OptionThumb option={option} images={images} />
      <span className="options-map-text">
        <span className="options-map-name">
          {option.status === 'favorite' && (
            <span className="status-mark favorite" title="Favorite">
              <Icon name="star" size={14} filled />
            </span>
          )}
          {option.status === 'chosen' && (
            <span className="status-mark chosen" title="Chosen">
              <Icon name="check" size={14} weight={2.6} />
            </span>
          )}
          {option.name}
        </span>
        <span className="muted small">
          {[option.category, priceText(option, trip), item.distanceKm != null && formatKm(item.distanceKm), !located && 'not on the map']
            .filter(Boolean)
            .join(' · ')}
        </span>
        <ItineraryTags state={inPlan} />
      </span>
      <span className="options-map-side">
        {option.rating != null && <Stars value={option.rating} />}
        {item.score != null && (
          <span className="options-map-score" title="Score (0–100)">
            {item.score}
          </span>
        )}
      </span>
    </li>
  )
}

function OptionThumb({ option, images }: { option: TripOption; images: Blob[] }) {
  return (
    <span className={`options-map-thumb${images.length ? '' : ' empty'}`}>
      {images.length ? <BlobImage image={images[0]} alt="" /> : <Icon name={KIND_ICON[option.kind]} size={18} />}
    </span>
  )
}

/** An option's pin, the same on both maps: a dot in its kind's color (the base tile for the base hotel), its card when highlighted. */
export function OptionPin({
  item,
  base,
  isBase,
  trip,
  images,
  planned,
  active,
  floatingTip,
  approximate,
}: {
  item: Scored
  base?: StayBase
  isBase: boolean
  trip: Trip
  images: Blob[]
  planned: ItineraryState
  active: boolean
  floatingTip: boolean
  /** Offline map: shown at Google's position (not found in OpenStreetMap). */
  approximate?: boolean
}) {
  const { option } = item
  return (
    <span
      data-option-pin={option.id}
      className={`option-pin kind-${option.kind}${planned || isBase ? '' : ' faded'}${option.status === 'discarded' ? ' discarded' : ''}${active ? ' active' : ''}${approximate ? ' approximate' : ''}`}
    >
      {isBase && base ? (
        <span className="base-pin" aria-hidden="true" dangerouslySetInnerHTML={{ __html: baseMarkerSvg(base) }} />
      ) : (
        <span className="option-pin-dot">
          <Icon name={KIND_ICON[option.kind]} size={15} weight={2.2} />
        </span>
      )}
      {active && !floatingTip && <OptionTip option={option} trip={trip} images={images} inPlan={planned} />}
    </span>
  )
}

/** Lets the list move the Google map. */
function GoogleApi({ apiRef }: { apiRef: MutableRefObject<OptionsMapApi | null> }) {
  const map = useMap(OPTIONS_MAP_ID)
  useEffect(() => {
    if (!map) return
    apiRef.current = {
      reveal: (point, covered) => {
        map.panTo(point)
        if (covered) map.panBy(0, covered / 2)
      },
    }
    return () => {
      apiRef.current = null
    }
  }, [map, apiRef])
  return null
}

function OptionsMapCanvas({
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
  const status = useApiLoadingStatus()
  const online = useOnline()
  // Only before the map exists: a map already shown is kept (unmounting it offline can make Google's code throw).
  if (status === APILoadingStatus.FAILED || (!online && status !== APILoadingStatus.LOADED && status !== APILoadingStatus.AUTH_FAILURE)) {
    return <MapMessage online={online} />
  }
  const center = items[0]?.option ?? base
  return (
    <ErrorBoundary fallback={<MapMessage online={online} />}>
      <Map
        id={OPTIONS_MAP_ID}
        mapId="DEMO_MAP_ID"
        colorScheme={dark ? 'DARK' : 'LIGHT'}
        defaultCenter={center?.lat != null && center.lng != null ? { lat: center.lat, lng: center.lng } : { lat: 35.6812, lng: 139.7671 }}
        defaultZoom={13}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        onClick={onMapClick}
      >
        {items.map((item) => {
          const { option } = item
          const active = option.id === activeId
          const planned = inPlan(option)
          const isBase = option.id === baseOption?.option.id
          return (
            <AdvancedMarker
              key={option.id}
              position={{ lat: option.lat!, lng: option.lng! }}
              anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
              title={active ? undefined : option.name}
              // The highlighted one on top, then the ones in the itinerary.
              zIndex={active ? 1000 : isBase ? 3 : planned ? 2 : 1}
              onClick={() => onPinClick(option)}
              onMouseEnter={onHover && (() => onHover(option.id))}
              onMouseLeave={onHover && (() => onHover(null))}
            >
              <OptionPin
                item={item}
                base={base}
                isBase={isBase}
                trip={trip}
                images={photos.get(option.id) ?? []}
                planned={planned}
                active={active}
                floatingTip={floatingTip}
              />
            </AdvancedMarker>
          )
        })}
        {base && !baseOption && (
          <AdvancedMarker position={base} anchorPoint={AdvancedMarkerAnchorPoint.CENTER} title={`Base: ${base.name}`} zIndex={0}>
            <span className="base-pin" aria-hidden="true" dangerouslySetInnerHTML={{ __html: baseMarkerSvg(base) }} />
          </AdvancedMarker>
        )}
        <FitOptions points={[...items.map((i) => ({ id: i.option.id, lat: i.option.lat!, lng: i.option.lng! })), ...(base ? [{ id: 'base', ...base }] : [])]} covered={covered} />
        <GoogleApi apiRef={apiRef} />
      </Map>
    </ErrorBoundary>
  )
}

/**
 * The pin's card on computers: fixed over the page above its pin (below it near the top of the window),
 * following the pin while the page scrolls or the map moves.
 */
function FloatingTip(props: { option: TripOption; trip: Trip; images: Blob[]; inPlan: ItineraryState }) {
  const tip = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    let frame = 0
    const place = () => {
      const pin = document.querySelector(`[data-option-pin="${props.option.id}"]`)
      const el = tip.current
      const pane = pin?.closest('.options-map-pane')?.getBoundingClientRect()
      const r = pin?.getBoundingClientRect()
      const x = r && r.left + r.width / 2
      const y = r && r.top + r.height / 2
      // Not over the map (scrolled or panned out of it): no card.
      const visible = !!(pane && r && x! >= pane.left && x! <= pane.right && y! >= pane.top && y! <= pane.bottom)
      if (el && !visible) el.style.visibility = 'hidden'
      if (el && r && visible) {
        const { width, height } = el.getBoundingClientRect()
        const gap = 8
        const top = r.top - gap - height >= gap ? r.top - gap - height : r.bottom + gap
        const left = Math.min(Math.max(gap, r.left + r.width / 2 - width / 2), window.innerWidth - width - gap)
        el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
        el.style.visibility = 'visible'
      }
      frame = requestAnimationFrame(place)
    }
    place()
    return () => cancelAnimationFrame(frame)
  }, [props.option.id])
  return createPortal(<OptionTip {...props} floating ref={tip} />, document.body)
}

/** The little card over a highlighted pin: photo, name, kind, price, rating. */
function OptionTip({
  option,
  trip,
  images,
  inPlan,
  floating,
  ref,
}: {
  option: TripOption
  trip: Trip
  images: Blob[]
  inPlan: ItineraryState
  floating?: boolean
  ref?: Ref<HTMLSpanElement>
}) {
  return (
    <span ref={ref} className={`option-tip${floating ? ' floating' : ''}`}>
      {images.length > 0 && (
        <span className="option-tip-photo">
          <BlobImage image={images[0]} alt="" />
        </span>
      )}
      <span className="option-tip-text">
        <strong>{option.name}</strong>
        <span className="muted small">{[option.category, priceText(option, trip)].filter(Boolean).join(' · ')}</span>
        {option.rating != null && <Stars value={option.rating} />}
        <ItineraryTags state={inPlan} />
      </span>
    </span>
  )
}

/** Fits the city's options when the set shown changes (a city, a kind), not when one is highlighted. */
function FitOptions({ points, covered }: { points: { id: string; lat: number; lng: number }[]; covered: number }) {
  const map = useMap(OPTIONS_MAP_ID)
  const key = points.map((p) => `${p.id}:${p.lat},${p.lng}`).sort().join('|')
  useEffect(() => {
    if (!map || points.length === 0) return
    if (points.length === 1) {
      map.setCenter(points[0])
      map.setZoom(15)
      if (covered) map.panBy(0, covered / 2)
      return
    }
    const bounds = new google.maps.LatLngBounds()
    points.forEach((p) => bounds.extend(p))
    map.fitBounds(bounds, { top: 48, left: 32, right: 32, bottom: covered + 32 })
    // Only when the options shown change; the drawer moving doesn't refit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])
  return null
}

function MapMessage({ online }: { online: boolean }) {
  return (
    <div className="card map-unavailable">
      <p>{online ? 'The map could not load. Reload the page to try again.' : 'No internet: the map is not available. Your options are listed here.'}</p>
      {online && (
        <button type="button" onClick={() => location.reload()}>
          Reload
        </button>
      )}
    </div>
  )
}

/** "With the map on and no city chosen": the map shows one city at a time, so nothing is loaded until one is picked. */
export function PickCityForMap({ cities, onPick }: { cities: string[]; onPick: (city: string) => void }) {
  return (
    <div className="options-map-pick">
      <Icon name="map" size={28} />
      <p>
        <strong>The map shows one city at a time.</strong>
        <br />
        <span className="muted small">Pick one:</span>
      </p>
      <div className="row wrap options-map-cities">
        {cities.map((city) => (
          <CityButton key={city} city={city} onPick={() => onPick(city)} />
        ))}
      </div>
    </div>
  )
}

function CityButton({ city, onPick }: { city: string; onPick: () => void }) {
  const hue = useCityHue(city)
  return (
    <button type="button" onClick={onPick}>
      <span className="city-dot" style={{ ['--hue' as string]: hue }} />
      {city}
    </button>
  )
}

/** "¥3,000" (for everyone going), "¥18,000 / night" for hotels; '' without a price. */
function priceText(option: TripOption, trip: Trip): string {
  if (!option.price) return ''
  if (DAY_KINDS.includes(option.kind)) return formatMoney(pricedTotal(optionPriced(option), travelersOf(trip))!)
  return option.kind === 'hotel' ? `${formatMoney(option.price)} / night` : formatMoney(option.price)
}
