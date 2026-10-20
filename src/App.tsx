import { APIProvider } from '@vis.gl/react-google-maps'
import { SettingsPanel } from './SettingsPanel'
import { TransitSpike } from './spike/TransitSpike'

const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

export default function App() {
  const content = (
    <main>
      <header>
        <h1>
          Tabi <span lang="ja">旅</span>
        </h1>
      </header>
      <SettingsPanel />
      <TransitSpike hasGoogleKey={!!googleKey} />
      <footer className="muted small">
        Map and route data © Google. Transit routes by NAVITIME JAPAN.
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
