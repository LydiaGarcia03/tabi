import { useState } from 'react'
import { loadTripData } from '../db/tripData'
import { downloadFile, fileSlug } from '../download'
import { toBackupJson } from '../export/backup'
import { toGpx } from '../export/gpx'
import { buildItinerary } from '../export/itinerary'
import { toKml } from '../export/kml'
import { getRapidApiKey } from '../settings'

interface Props {
  tripId: string
  /** Export only this day (no backup button). */
  day?: { id: string; number: number }
}

/** Downloads for offline use: KML/GPX for Organic Maps and, for a trip, the JSON backup. */
export function ExportCard({ tripId, day }: Props) {
  const [error, setError] = useState('')
  const [includeKey, setIncludeKey] = useState(false)
  const hasKey = !!getRapidApiKey()

  async function download(kind: 'kml' | 'gpx' | 'backup') {
    setError('')
    try {
      const data = await loadTripData(tripId)
      if (!data) throw new Error('Trip not found.')
      const title = day ? `${data.trip.name} · Day ${day.number}` : data.trip.name
      const name = fileSlug(data.trip.name, day ? `day ${day.number}` : '')
      if (kind === 'backup') {
        const date = new Date().toLocaleDateString('en-CA') // Local "YYYY-MM-DD".
        const key = includeKey ? getRapidApiKey() : null
        downloadFile(`${name}-backup-${date}.json`, toBackupJson(data, key), 'application/json')
        return
      }
      const itinerary = buildItinerary(data, day && [day.id])
      if (itinerary.points.length === 0) throw new Error('There are no places to export yet.')
      if (kind === 'kml') downloadFile(`${name}.kml`, toKml(title, itinerary), 'application/vnd.google-earth.kml+xml')
      else downloadFile(`${name}.gpx`, toGpx(title, itinerary), 'application/gpx+xml')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section className="card export-card">
      <h2>{day ? 'Export this day' : 'Export & backup'}</h2>
      <p className="muted small">
        For offline maps, open the KML file with <strong>Organic Maps</strong> (free): pins, notes and the drawn routes
        become a list you can use without internet. Segments not drawn on the map are exported as text only.
      </p>
      <div className="row wrap">
        <button type="button" onClick={() => download('kml')}>
          🗺️ Organic Maps (KML)
        </button>
        <button type="button" onClick={() => download('gpx')}>
          GPX
        </button>
        {!day && (
          <button type="button" onClick={() => download('backup')}>
            💾 Backup (JSON)
          </button>
        )}
      </div>
      {!day && (
        <p className="muted small">
          The backup has the whole trip. Import it on another device (Trips → Import a backup) to move or restore it.
        </p>
      )}
      {!day && hasKey && (
        <>
          <label className="check">
            <input type="checkbox" checked={includeKey} onChange={(e) => setIncludeKey(e.target.checked)} />
            Include my NAVITIME key in the backup
          </label>
          {includeKey && (
            <p className="warning small">
              The file will contain your key: keep it private (send it only to yourself) and don't share it.
            </p>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
