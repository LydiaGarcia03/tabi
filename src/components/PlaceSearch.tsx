import { useMap } from '@vis.gl/react-google-maps'
import { useState, type FormEvent } from 'react'
import { searchPlaces, type PlaceResult } from '../places/googlePlaces'
import { formatCoordinates, parseCoordinates, type LatLng } from '../places/coordinates'
import { DAY_MAP_ID } from './DayMap'
import { Icon } from './Icon'

interface Props {
  onAdd: (place: PlaceResult | { name: string; lat: number; lng: number }) => Promise<void>
  /** The trip's first country ("JP"): results there come first. */
  region?: string
}

/**
 * Text search; runs only when the user presses Search (each search = 1 request). Coordinates or a Google
 * Maps link give a custom pin at that point, with no request.
 */
export function PlaceSearch({ onAdd, region }: Props) {
  const map = useMap(DAY_MAP_ID)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[] | null>(null)
  const [point, setPoint] = useState<LatLng | null>(null)
  const [status, setStatus] = useState<'idle' | 'searching' | 'error'>('idle')
  const [error, setError] = useState('')

  async function search(e: FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    const typed = parseCoordinates(query)
    setPoint(typed)
    if (typed) return setResults([])
    setStatus('searching')
    try {
      // Results near what the map shows come first.
      setResults(await searchPlaces(query.trim(), map?.getBounds(), region))
      setStatus('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  async function addAndClose(place: PlaceResult | { name: string; lat: number; lng: number }) {
    await onAdd(place)
    setResults(null)
    setPoint(null)
    setQuery('')
  }

  return (
    <div className="place-search">
      <form onSubmit={search} className="row">
        <input
          type="search"
          placeholder="Search a place (e.g. Senso-ji) or paste coordinates"
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
          {point && (
            <li>
              <div>
                <strong>
                  <Icon name="pin" size={15} /> Point at {formatCoordinates(point)}
                </strong>
                <div className="muted small">A custom pin: rename it in the place's editor.</div>
              </div>
              <button type="button" onClick={() => addAndClose({ name: 'Custom pin', ...point })}>
                Add
              </button>
            </li>
          )}
          {!point && results.length === 0 && <li className="muted">No places found.</li>}
          {results.map((r) => (
            <li key={r.googlePlaceId}>
              <div>
                <strong>{r.name}</strong>
                {r.address && <div className="muted small">{r.address}</div>}
              </div>
              <button type="button" onClick={() => addAndClose(r)}>
                Add
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="link"
              onClick={() => {
                setResults(null)
                setPoint(null)
              }}
            >
              Close results
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
