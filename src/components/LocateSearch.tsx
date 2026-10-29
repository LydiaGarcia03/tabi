import { useState, type SyntheticEvent } from 'react'
import { searchPlaces, type PlaceResult } from '../places/googlePlaces'
import { formatCoordinates, parseCoordinates } from '../places/coordinates'
import { useOnline } from '../useOnline'
import { Icon } from './Icon'

/** A Google place, or a point typed as coordinates (no place id). */
export type Located = Omit<PlaceResult, 'googlePlaceId'> & { googlePlaceId?: string }

interface Props {
  /** Prefilled search text (e.g. the option name). */
  initialQuery?: string
  onPick: (place: Located) => void
  placeholder?: string
  /** A city added to the search when the text doesn't name it (a hotel name alone can be anywhere). */
  near?: string
  /** The trip's first country ("JP"): results there come first. */
  region?: string
}

/**
 * Finds a place on Google to get its location (1 request per search, only on "Search"). Coordinates
 * ("34.679788, 135.601221", 34°40'47.2"N 135°36'04.4"E, a Google Maps link) give that point, with no request.
 */
export function LocateSearch({ initialQuery = '', onPick, placeholder = 'Search on the map, or paste coordinates…', near, region }: Props) {
  const online = useOnline()
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<Located[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function search(e: SyntheticEvent) {
    e.preventDefault()
    e.stopPropagation() // May sit inside another form.
    const text = query.trim()
    if (!text) return
    setError('')
    const point = parseCoordinates(text)
    if (point) return setResults([{ ...point, name: formatCoordinates(point) }])
    if (!online) return setError('Without internet only coordinates work (e.g. 34.67979, 135.60122).')
    setBusy(true)
    try {
      const city = near?.trim()
      setResults(await searchPlaces(city && !text.toLowerCase().includes(city.toLowerCase()) ? `${text} ${city}` : text, null, region))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="locate-search">
      {/* A div, not a form: this can be nested inside the option form. */}
      <div className="row">
        <input
          type="search"
          value={query}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search(e)}
          aria-label="Search a place"
        />
        <button type="button" onClick={search} disabled={busy}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </div>
      {error && <p className="error small">{error}</p>}
      {results && (
        <ul className="search-results">
          {results.length === 0 && <li className="muted">No places found.</li>}
          {results.map((r) => (
            <li key={r.googlePlaceId ?? r.name}>
              <div>
                {r.googlePlaceId ? (
                  <strong>{r.name}</strong>
                ) : (
                  <strong>
                    <Icon name="pin" size={15} /> Point at {r.name}
                  </strong>
                )}
                {r.address && <div className="muted small">{r.address}</div>}
              </div>
              <button
                type="button"
                onClick={() => {
                  onPick(r)
                  setResults(null)
                }}
              >
                Use
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
