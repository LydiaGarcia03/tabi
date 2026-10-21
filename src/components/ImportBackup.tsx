import { useState, type ChangeEvent } from 'react'
import type { TripData } from '../db/tripData'
import { importBackup, parseBackup, tripExists } from '../export/backup'
import { navigate } from '../router'

/** Restores a trip from a backup file (from this or another device). */
export function ImportBackup() {
  const [conflict, setConflict] = useState<TripData | null>(null)
  const [error, setError] = useState('')

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // Allow choosing the same file again.
    if (!file) return
    setError('')
    setConflict(null)
    try {
      const data = parseBackup(await file.text())
      if (await tripExists(data.trip.id)) setConflict(data)
      else await save(data, 'replace')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function save(data: TripData, mode: 'replace' | 'copy') {
    const tripId = await importBackup(data, mode)
    navigate({ page: 'trip', tripId })
  }

  return (
    <section className="card">
      <h2>Import backup</h2>
      <p className="muted small">Open a backup file (.json) exported from Tabi on this or another device.</p>
      <input type="file" accept=".json,application/json" onChange={onFile} aria-label="Backup file" />
      {conflict && (
        <div className="import-conflict">
          <p>
            “{conflict.trip.name}” is already on this device. Replace it with the backup (changes made here since then
            are lost), or keep both?
          </p>
          <div className="row wrap">
            <button type="button" className="danger" onClick={() => save(conflict, 'replace')}>
              Replace
            </button>
            <button type="button" onClick={() => save(conflict, 'copy')}>
              Keep both
            </button>
            <button type="button" onClick={() => setConflict(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
