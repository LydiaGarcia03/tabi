import { useState, type SyntheticEvent } from 'react'
import { searchPlaces, type PlaceResult } from '../places/googlePlaces'
import { useOnline } from '../useOnline'

interface Props {
  /** Prefilled search text (e.g. the option name). */
  initialQuery?: string
  onPick: (place: PlaceResult) => void
  placeholder?: string
  /** A city added to the search when the text doesn't name it (a hotel name alone can be anywhere). */
  near?: string
  /** The trip's first country ("JP"): results there come first. */
  region?: string
}

/** Finds a place on Google to get its location (1 request per search, only on "Search"). */
export function LocateSearch({ initialQuery = '', onPick, placeholder = 'Search on the map…', near, region }: Props) {
  const online = useOnline()
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<PlaceResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function search(e: SyntheticEvent) {
    e.preventDefault()
    e.stopPropagation() // May sit inside another form.
    if (!query.trim()) return
    setBusy(true)
    setError('')
    try {
      const text = query.trim()
      const city = near?.trim()
      setResults(await searchPlaces(city && !text.toLowerCase().includes(city.toLowerCase()) ? `${text} ${city}` : text, null, region))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!online) return <p className="muted small">Locating on the map needs internet.</p>

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
            <li key={r.googlePlaceId}>
              <div>
                <strong>{r.name}</strong>
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
