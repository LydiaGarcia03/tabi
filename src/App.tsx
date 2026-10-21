import { APIProvider } from '@vis.gl/react-google-maps'
import { useLiveQuery } from 'dexie-react-hooks'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Icon, Logo } from './components/Icon'
import { formatDate } from './dates'
import { db } from './db/db'
import { BudgetPage } from './pages/BudgetPage'
import { DayPage } from './pages/DayPage'
import { LogbookPage } from './pages/LogbookPage'
import { OptionsPage } from './pages/OptionsPage'
import { SettingsPage } from './pages/SettingsPage'
import { TripPage } from './pages/TripPage'
import { TripsPage } from './pages/TripsPage'
import { href, useRoute, type Route } from './router'
import { TransitSpike } from './spike/TransitSpike'
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
            Tabi <span lang="ja">旅</span>
          </span>
        </a>
        <a className="icon-button" href={href({ page: 'settings' })} aria-label="Settings" title="Settings">
          <Icon name="settings" size={20} />
        </a>
      </header>
      {!online && (
        <p className="offline-banner small">
          Offline: showing what is saved on this device. Map, search and route suggestions need internet.
        </p>
      )}
      <main className={`page page-${route.page}`}>
        <ErrorBoundary key={location.hash} fallback={<PageError />}>
          <Page route={route} />
        </ErrorBoundary>
      </main>
      <footer className="app-footer muted small">
        Map and place data © Google. Transit routes by NAVITIME JAPAN. Station names from Wikidata.
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
      return <OptionsPage tripId={route.tripId} />
    case 'budget':
      return <BudgetPage tripId={route.tripId} />
    case 'logbook':
      return <LogbookPage tripId={route.tripId} />
    case 'settings':
      return <SettingsPage />
    case 'transit-spike':
      return <TransitSpike hasGoogleKey={!!googleKey} />
  }
}
