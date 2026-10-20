// Phase 1 spike: ask Google and NAVITIME for the same public-transit trip
// (Shinjuku Station → Senso-ji) and show both answers side by side.
// Nothing is requested automatically: each provider only runs on a click.

import { useEffect, useMemo, useState } from 'react'
import { translateRouteResult } from '../i18n/japaneseNames'
import { googleProvider } from '../routing/googleProvider'
import { createNavitimeProvider } from '../routing/navitimeProvider'
import { RouteProviderError, type LatLng, type RouteProvider, type RouteProviderId, type RouteResult } from '../routing/types'
import { getRapidApiKey, loadJson, saveJson } from '../settings'
import { RouteMap } from './RouteMap'
import { RouteResultView } from './RouteResultView'

const ORIGIN: LatLng & { name: string } = { name: 'Shinjuku Station', lat: 35.6896, lng: 139.7006 }
const DESTINATION: LatLng & { name: string } = { name: 'Asakusa (Senso-ji)', lat: 35.7148, lng: 139.7967 }

// NAVITIME results are kept on the device so a page reload never spends quota.
const NAVITIME_CACHE_KEY = 'tabi.spike.navitimeResult'

type ProviderState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; result: RouteResult }

const navitimeProvider = createNavitimeProvider(getRapidApiKey)

interface Props {
  hasGoogleKey: boolean
}

export function TransitSpike({ hasGoogleKey }: Props) {
  const [departure, setDeparture] = useState(defaultDeparture)
  const [states, setStates] = useState<Record<RouteProviderId, ProviderState>>(() => {
    const cached = loadJson<RouteResult>(NAVITIME_CACHE_KEY)
    return { google: { status: 'idle' }, navitime: cached ? { status: 'done', result: cached } : { status: 'idle' } }
  })
  const [selected, setSelected] = useState<{ providerId: RouteProviderId; index: number } | null>(null)

  // Translate a result saved before translation existed (no new request needed).
  useEffect(() => {
    const cached = states.navitime.status === 'done' ? states.navitime.result : null
    if (!cached) return
    void translateRouteResult(cached).then((translated) => {
      if (translated === cached) return
      saveJson(NAVITIME_CACHE_KEY, translated)
      setStates((s) => ({ ...s, navitime: { status: 'done', result: translated } }))
    })
    // Only on mount: fresh results are translated in run().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function run(provider: RouteProvider) {
    setStates((s) => ({ ...s, [provider.id]: { status: 'loading' } }))
    try {
      const result = await translateRouteResult(
        await provider.computeTransit({
          origin: ORIGIN,
          destination: DESTINATION,
          departureTime: new Date(`${departure}:00+09:00`),
        }),
      )
      if (provider.id === 'navitime') saveJson(NAVITIME_CACHE_KEY, result)
      setStates((s) => ({ ...s, [provider.id]: { status: 'done', result } }))
      if (result.options.length > 0) setSelected({ providerId: provider.id, index: 0 })
    } catch (error) {
      const message =
        error instanceof RouteProviderError
          ? `${error.kind}: ${error.message}`
          : `unexpected: ${error instanceof Error ? error.message : String(error)}`
      setStates((s) => ({ ...s, [provider.id]: { status: 'error', message } }))
    }
  }

  const selectedOption = useMemo(() => {
    if (!selected) return null
    const state = states[selected.providerId]
    return state.status === 'done' ? (state.result.options[selected.index] ?? null) : null
  }, [selected, states])

  const columns: { provider: RouteProvider; disabledReason?: string; hint: string }[] = [
    {
      provider: googleProvider,
      disabledReason: hasGoogleKey ? undefined : 'Google key missing (VITE_GOOGLE_MAPS_API_KEY).',
      hint: 'Routes API, travel mode TRANSIT.',
    },
    {
      provider: navitimeProvider,
      hint: 'Uses 1 of the 500 free requests per month. The result is saved on this device.',
    },
  ]

  return (
    <section>
      <div className="card">
        <h2>Transit spike</h2>
        <p>
          <strong>{ORIGIN.name}</strong> → <strong>{DESTINATION.name}</strong> by public transport.
        </p>
        <label>
          Departure (Tokyo time)
          <input type="datetime-local" value={departure} onChange={(e) => setDeparture(e.target.value)} />
        </label>
        <p className="muted small">Google only has transit schedules up to ~100 days ahead, so use a near date.</p>
      </div>

      <div className="columns">
        {columns.map(({ provider, disabledReason, hint }) => {
          const state = states[provider.id]
          return (
            <div key={provider.id} className="card">
              <h3>{provider.name}</h3>
              <p className="muted small">{hint}</p>
              <button
                type="button"
                className="primary"
                disabled={!!disabledReason || state.status === 'loading'}
                onClick={() => run(provider)}
              >
                {state.status === 'loading' ? 'Asking…' : `Ask ${provider.name}`}
              </button>
              {disabledReason && <p className="error">{disabledReason}</p>}
              {state.status === 'error' && <p className="error">{state.message}</p>}
              {state.status === 'done' && (
                <RouteResultView
                  result={state.result}
                  selectedIndex={selected?.providerId === provider.id ? selected.index : null}
                  onSelect={(index) => setSelected({ providerId: provider.id, index })}
                />
              )}
            </div>
          )
        })}
      </div>

      {hasGoogleKey && <RouteMap origin={ORIGIN} destination={DESTINATION} option={selectedOption} />}
    </section>
  )
}

/** Tomorrow at 09:00 Tokyo time, as a datetime-local value ("YYYY-MM-DDTHH:mm"). */
function defaultDeparture(): string {
  const tokyoNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  tokyoNow.setUTCDate(tokyoNow.getUTCDate() + 1)
  return `${tokyoNow.toISOString().slice(0, 10)}T09:00`
}
