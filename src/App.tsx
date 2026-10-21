import { APIProvider } from '@vis.gl/react-google-maps'
import { ErrorBoundary } from './components/ErrorBoundary'
import { DayPage } from './pages/DayPage'
import { SettingsPage } from './pages/SettingsPage'
import { TripPage } from './pages/TripPage'
import { TripsPage } from './pages/TripsPage'
import { href, useRoute, type Route } from './router'
import { TransitSpike } from './spike/TransitSpike'
import { useOnline } from './useOnline'

const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

export default function App() {
  const route = useRoute()
  const online = useOnline()

  const content = (
    <main>
      <header className="app-header">
        <h1>
          <a href={href({ page: 'trips' })}>
            Tabi <span lang="ja">旅</span>
          </a>
        </h1>
        <a href={href({ page: 'settings' })}>Settings</a>
      </header>
      {!online && (
        <p className="offline-banner small">
          Offline: showing what is saved on this device. Map, search and route suggestions need internet.
        </p>
      )}
      <ErrorBoundary key={location.hash} fallback={<PageError />}>
        <Page route={route} />
      </ErrorBoundary>
      <footer className="muted small">
        Map and place data © Google. Transit routes by NAVITIME JAPAN. Station names from Wikidata.
      </footer>
    </main>
  )

  return googleKey ? (
    <APIProvider apiKey={googleKey} language="en" region="JP">
      {content}
    </APIProvider>
  ) : (
    content
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
    case 'settings':
      return <SettingsPage />
    case 'transit-spike':
      return <TransitSpike hasGoogleKey={!!googleKey} />
  }
}
