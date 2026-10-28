import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { db } from '../db/db'
import { useOnline } from '../useOnline'
import { areaTiles } from './area'
import { downloadTripMap, type Progress } from './download'

/**
 * A trip's offline map on this device (`area`: undefined while loading, null when not downloaded) and its
 * download: the area around every place and city base. Used by the day map and the Logbook's warning.
 */
export function useTripMapDownload(tripId: string) {
  const online = useOnline()
  const area = useLiveQuery(async () => (await db.mapAreas.get(tripId)) ?? null, [tripId])
  const tripPoints = useLiveQuery(async () => {
    const [all, stays] = await Promise.all([db.places.where('tripId').equals(tripId).toArray(), db.stays.where('tripId').equals(tripId).toArray()])
    return [...all, ...stays.flatMap((s) => (s.base ? [s.base] : []))].map((p) => ({ lat: p.lat, lng: p.lng }))
  }, [tripId])
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)

  async function download() {
    setError('')
    abort.current = new AbortController()
    try {
      const complete = await downloadTripMap(tripId, tripPoints ?? [], setProgress, abort.current.signal)
      if (!complete) {
        setError("The 50 MB limit of one download was reached: the areas farthest from your places were left out (marked if a place is there).")
      }
    } catch (err) {
      if (!abort.current.signal.aborted) setError(err instanceof Error ? err.message : String(err))
    } finally {
      setProgress(null)
    }
  }

  return {
    online,
    area,
    tripPoints,
    estimate: tripPoints ? areaTiles(tripPoints) : null,
    progress,
    error,
    download,
    cancel: () => abort.current?.abort(),
  }
}
