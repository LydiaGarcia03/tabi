import { useTripMapDownload } from '../../offlineMap/useTripMapDownload'
import { Icon } from '../Icon'

/**
 * Phones (User's choice 2A from a mock, 2026-10-28): while this trip has no offline map on the device, a line
 * saying so with the download right here, so it's done before losing signal. Gone once downloaded.
 */
export function OfflineMapWarning({ tripId }: { tripId: string }) {
  const { online, area, estimate, progress, error, download, cancel } = useTripMapDownload(tripId)
  if (area !== null || !estimate) return null
  return (
    <section className="logbook-warning small">
      <strong>No offline map on this phone yet</strong>
      <span>Download it while you have internet, so the map works in airplane mode.</span>
      {progress ? (
        <span className="offline-progress">
          <span>
            Downloading… {progress.done} / {progress.total} tiles ({(progress.bytes / 1024 / 1024).toFixed(1)} MB)
          </span>
          <span className="progress">
            <span style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
          </span>
          <button type="button" onClick={cancel}>
            Cancel
          </button>
        </span>
      ) : online ? (
        <button type="button" className="link logbook-warning-action" onClick={() => void download()}>
          <Icon name="download" size={16} /> Download now (about {estimate.tiles.length.toLocaleString('en')} tiles)
        </button>
      ) : (
        <span className="muted">Connect to the internet to download it.</span>
      )}
      {error && <span className="error">{error}</span>}
    </section>
  )
}
