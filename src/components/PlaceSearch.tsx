import { useMap } from '@vis.gl/react-google-maps'
import { useState, type FormEvent } from 'react'
import { searchPlaces, type PlaceResult } from '../places/googlePlaces'
import { DAY_MAP_ID } from './DayMap'

interface Props {
  onAdd: (place: PlaceResult) => Promise<void>
}

/** Text search; runs only when the user presses Search (each search = 1 request). */
export function PlaceSearch({ onAdd }: Props) {
  const map = useMap(DAY_MAP_ID)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[] | null>(null)
  const [status, setStatus] = useState<'idle' | 'searching' | 'error'>('idle')
  const [error, setError] = useState('')

  async function search(e: FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setStatus('searching')
    try {
      // Results near what the map shows come first.
      setResults(await searchPlaces(query.trim(), map?.getBounds()))
      setStatus('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  return (
    <div className="place-search">
      <form onSubmit={search} className="row">
        <input
          type="search"
          placeholder="Search a place (e.g. Senso-ji)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search a place"
        />
        <button type="submit" disabled={status === 'searching'}>
          {status === 'searching' ? 'Searching…' : 'Search'}
        </button>
      </form>
      {status === 'error' && <p className="error">{error}</p>}
      {results && (
        <ul className="search-results">
          {results.length === 0 && <li className="muted">No places found.</li>}
          {results.map((r) => (
            <li key={r.googlePlaceId}>
              <div>
                <strong>{r.name}</strong>
                {r.address && <div className="muted small">{r.address}</div>}
              </div>
              <button
                type="button"
                onClick={async () => {
                  await onAdd(r)
                  setResults(null)
                  setQuery('')
                }}
              >
                Add
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="link" onClick={() => setResults(null)}>
              Close results
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
