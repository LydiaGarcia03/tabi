import { APIProvider } from '@vis.gl/react-google-maps'
import { useLiveQuery } from 'dexie-react-hooks'
import { DebugBar } from './components/debug/DebugBar'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Icon, Logo } from './components/Icon'
import { formatDate } from './dates'
import { db } from './db/db'
import { DEBUG_AVAILABLE } from './debug'
import { BudgetPage } from './pages/BudgetPage'
import { DayPage } from './pages/DayPage'
import { LogbookPage } from './pages/LogbookPage'
import { IconsPage } from './pages/IconsPage'
import { OptionsPage } from './pages/OptionsPage'
import { SettingsPage } from './pages/SettingsPage'
import { TripPage } from './pages/TripPage'
import { TripsPage } from './pages/TripsPage'
import { href, useRoute, type Route } from './router'
import { TransitSpike } from './spike/TransitSpike'
import { syncNow, useSyncStatus } from './sync/sync'
import { useOnline } from './useOnline'

const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

/** Pages that use the full width on a computer (trip pages have a sidebar). */
const WIDE_PAGES: Route['page'][] = ['trip', 'day', 'options', 'budget', 'logbook', 'transit-spike']

export default function App() {
  const route = useRoute()
  const online = useOnline()

  const tripId = 'tripId' in route ? route.tripId : null

  const content = (
    <div className={`shell${WIDE_PAGES.includes(route.page) ? ' wide' : ''}${tripId ? ' in-trip' : ''}`}>
      <header className="app-bar">
        {tripId && <TripBarTitle tripId={tripId} />}
        <a className="brand" href={href({ page: 'trips' })}>
          <Logo />
          <span>
            {__APP__.name} <span lang="ja">{__APP__.nameJapanese}</span>
          </span>
        </a>
        <span className="app-bar-actions">
          {DEBUG_AVAILABLE && <DebugBar />}
          <a className="icon-button" href={href({ page: 'settings' })} aria-label="Settings" title="Settings">
            <Icon name="settings" size={20} />
          </a>
        </span>
      </header>
      {!online && (
        <p className="offline-banner small">
          Offline: showing what is saved on this device. Map, search and route suggestions need internet.
        </p>
      )}
      {online && route.page !== 'settings' && <SyncBanner />}
      <main className={`page page-${route.page}`}>
        <ErrorBoundary key={location.hash} fallback={<PageError />}>
          <Page route={route} />
        </ErrorBoundary>
      </main>
      <footer className="app-footer muted small">
        Map and place data © Google. Transit routes by NAVITIME JAPAN. Station names from Wikidata. Weather by Open-Meteo. Holidays from date-holidays · v. {__APP__.version}
      </footer>
    </div>
  )

  return googleKey ? (
    <APIProvider apiKey={googleKey} language="en" region="JP">
      {content}
    </APIProvider>
  ) : (
    content
  )
}

/**
 * On phones, inside a trip the bar shows where you are (like a native app):
 * back to all trips and the trip's name. Computers have the sidebar instead.
 */
function TripBarTitle({ tripId }: { tripId: string }) {
  const trip = useLiveQuery(() => db.trips.get(tripId), [tripId])
  return (
    <span className="app-bar-trip">
      <a className="icon-button" href={href({ page: 'trips' })} aria-label="All trips">
        <Icon name="back" size={20} />
      </a>
      <a className="app-bar-trip-name" href={href({ page: 'trip', tripId })}>
        <strong>{trip?.name}</strong>
        {trip && (
          <span className="muted">
            {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
          </span>
        )}
      </a>
    </span>
  )
}

/** Drive sync needs the user: the sign-in expired, a trip needs a choice, or it failed. */
function SyncBanner() {
  const status = useSyncStatus()
  if (!status.account) return null
  if (status.conflicts.length > 0) {
    const count = status.conflicts.length
    return (
      <p className="offline-banner sync-banner small">
        <span>Sync: {count === 1 ? '1 trip needs' : `${count} trips need`} your choice.</span>
        <a href={href({ page: 'settings' })}>Choose</a>
      </p>
    )
  }
  if (status.phase === 'signin') {
    return (
      <p className="offline-banner sync-banner small">
        <span>Sync paused: the Google sign-in expired.</span>
        <button type="button" onClick={() => void syncNow(true)}>
          Sign in
        </button>
      </p>
    )
  }
  if (status.phase === 'error') {
    return (
      <p className="offline-banner sync-banner small">
        <span>Sync failed: {status.error}</span>
        <button type="button" onClick={() => void syncNow(true)}>
          Retry
        </button>
      </p>
    )
  }
  return null
}

function PageError() {
  return (
    <section className="card">
      <p>Something went wrong on this page. Your data is safe on this device.</p>
      <button type="button" onClick={() => location.reload()}>
        Reload
      </button>
    </section>
  )
}

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case 'trips':
      return <TripsPage />
    case 'trip':
      return <TripPage tripId={route.tripId} />
    case 'day':
      return <DayPage tripId={route.tripId} dayId={route.dayId} hasGoogleKey={!!googleKey} />
    case 'options':
      return <OptionsPage tripId={route.tripId} hasGoogleKey={!!googleKey} />
    case 'budget':
      return <BudgetPage tripId={route.tripId} />
    case 'logbook':
      return <LogbookPage tripId={route.tripId} hasGoogleKey={!!googleKey} />
    case 'settings':
      return <SettingsPage />
    case 'transit-spike':
      return <TransitSpike hasGoogleKey={!!googleKey} />
    case 'icons':
      return <IconsPage />
  }
}
