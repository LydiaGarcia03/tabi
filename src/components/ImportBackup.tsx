import { useState, type ChangeEvent } from 'react'
import { importBackup, parseBackup, tripExists, type ParsedBackup } from '../export/backup'
import { navigate } from '../router'
import { setRapidApiKey } from '../settings'

/** Restores a trip from a backup file (from this or another device). */
export function ImportBackup() {
  const [conflict, setConflict] = useState<ParsedBackup | null>(null)
  const [error, setError] = useState('')

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // Allow choosing the same file again.
    if (!file) return
    setError('')
    setConflict(null)
    try {
      const backup = parseBackup(await file.text())
      if (await tripExists(backup.data.trip.id)) setConflict(backup)
      else await save(backup, 'replace')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function save(backup: ParsedBackup, mode: 'replace' | 'copy') {
    const tripId = await importBackup(backup.data, mode)
    // The key travels with the trip only when the user included it on export.
    if (backup.rapidApiKey) setRapidApiKey(backup.rapidApiKey)
    navigate({ page: 'trip', tripId })
  }

  return (
    <section className="import-backup">
      <p className="muted small">
        Open a backup file (.json) exported from Tabi on this or another device. If it includes your NAVITIME key, the key
        is saved on this device too.
      </p>
      <input type="file" accept=".json,application/json" onChange={onFile} aria-label="Backup file" />
      {conflict && (
        <div className="import-conflict">
          <p>
            “{conflict.data.trip.name}” is already on this device. Replace it with the backup (changes made here since
            then are lost), or keep both?
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
