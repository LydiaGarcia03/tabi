import { useState } from 'react'
import { formatDay } from '../dates'
import { chooseAlternative, deleteLeg, saveLeg, toSegments } from '../db/legs'
import type { Leg, Place, Segment } from '../db/model'
import type { Drawing } from '../drawing'
import { MODE_ICON, formatDuration, formatMoney } from '../format'
import { directionsUrl } from '../googleMapsLinks'
import { translateRouteResult } from '../i18n/japaneseNames'
import { computeWalkingRoute } from '../routing/googleProvider'
import { navitimeProvider, suggestionDate } from '../routing/providers'
import { RouteProviderError, type Money, type RouteOption } from '../routing/types'
import { SegmentForm } from './SegmentForm'
import { SegmentView } from './SegmentView'

interface Props {
  tripId: string
  leg: Leg | undefined
  from: Place
  to: Place
  /** Date of the day, "YYYY-MM-DD". */
  date: string
  /** Trip currency, used for new segment costs. */
  currency: string
  hasGoogleKey: boolean
  open: boolean
  onToggle: () => void
  /** Starts drawing a segment on the day map. */
  onDraw: (drawing: Drawing) => void
}

/** "How to get there" between two consecutive places. */
export function LegItem({ tripId, leg, from, to, date, currency, hasGoogleKey, open, onToggle, onDraw }: Props) {
  const segments = leg?.segments ?? []
  return (
    <li className={`leg-item${open ? ' open' : ''}${segments.length ? '' : ' empty'}`}>
      <button type="button" className="leg-summary" onClick={onToggle} aria-expanded={open}>
        <span className="leg-arrow">↓</span>
        <span className="leg-label">
          <span className="small">{segments.length ? 'How to get there' : '+ How to get there'}</span>
          {segments.length > 0 && <LegSummary segments={segments} />}
        </span>
      </button>
      {open && (
        <LegEditor
          tripId={tripId}
          leg={leg}
          from={from}
          to={to}
          date={date}
          currency={currency}
          hasGoogleKey={hasGoogleKey}
          onDraw={onDraw}
        />
      )}
    </li>
  )
}

function LegSummary({ segments }: { segments: Segment[] }) {
  const minutes = segments.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0)
  const fares = totalFares(segments)
  return (
    <span className="leg-chips">
      {segments.map((s) => (
        <span key={s.id} className="chip">
          {MODE_ICON[s.mode]} {s.mode !== 'walk' && s.lineName ? `${s.lineName} ` : ''}
          {s.durationMinutes != null && <span className="muted">{s.durationMinutes}′</span>}
        </span>
      ))}
      <span className="muted small">
        {minutes > 0 && formatDuration(minutes)}
        {fares.length > 0 && ` · ${fares.map(formatMoney).join(' + ')}`}
      </span>
    </span>
  )
}

type Editing = { kind: 'new' } | { kind: 'edit'; id: string } | null

function LegEditor({ tripId, leg, from, to, date, currency, hasGoogleKey, onDraw }: Omit<Props, 'open' | 'onToggle'>) {
  const [busy, setBusy] = useState<'transit' | 'walk' | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Editing>(null)
  const segments = leg?.segments ?? []

  const save = (next: Segment[]) => saveLeg(tripId, from.id, to.id, { segments: next })

  async function suggestTransit() {
    setBusy('transit')
    setError('')
    try {
      const askDate = suggestionDate(date)
      const time = from.plannedTime ?? '09:00'
      const result = await translateRouteResult(
        await navitimeProvider.computeTransit({
          origin: from,
          destination: to,
          departureTime: new Date(`${askDate}T${time}:00+09:00`),
        }),
      )
      if (result.options.length === 0) throw new RouteProviderError('no-route', 'NAVITIME found no route.')
      await saveLeg(tripId, from.id, to.id, {
        segments: toSegments(result.options[0].segments, from, to),
        source: 'navitime',
        fetchedAt: result.fetchedAt,
        alternatives: result.options,
        alternativesDate: askDate,
      })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function suggestWalk() {
    setBusy('walk')
    setError('')
    try {
      const segment = await computeWalkingRoute(from, to)
      await saveLeg(tripId, from.id, to.id, {
        segments: toSegments([segment], from, to),
        source: 'google',
        fetchedAt: new Date().toISOString(),
      })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  /** Draw starting where the previous segment ends (or at the place), ending where the next begins. */
  function startDrawing(list: Segment[], index: number) {
    const segment = list[index]
    const previous = list[index - 1]
    const next = list[index + 1]
    onDraw({
      fromPlaceId: from.id,
      toPlaceId: to.id,
      segmentId: segment.id,
      mode: segment.mode,
      color: segment.color,
      start: previous ? previous.path.at(-1) : { lat: from.lat, lng: from.lng },
      end: next ? next.path[0] : { lat: to.lat, lng: to.lng },
      taps: [],
    })
  }

  function move(index: number, delta: -1 | 1) {
    const next = [...segments]
    ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
    void save(next)
  }

  return (
    <div className="leg-editor">
      <p className="small muted">
        {from.name} → {to.name}
      </p>

      <div className="row wrap">
        <button type="button" onClick={suggestTransit} disabled={busy != null}>
          {busy === 'transit' ? 'Asking NAVITIME…' : '🚇 Suggest transit'}
        </button>
        {hasGoogleKey && (
          <button type="button" onClick={suggestWalk} disabled={busy != null}>
            {busy === 'walk' ? 'Asking Google…' : '🚶 Walking route'}
          </button>
        )}
        <button type="button" onClick={() => setEditing({ kind: 'new' })} disabled={editing != null}>
          + Add segment
        </button>
      </div>
      <p className="muted small">
        Transit uses 1 of the 500 free NAVITIME requests per month.
        {segments.length > 0 && ' A suggestion replaces the current segments.'}
      </p>
      {error && <p className="error">{error}</p>}

      {leg?.alternatives && leg.alternatives.length > 1 && (
        <Alternatives leg={leg} options={leg.alternatives} from={from} to={to} date={date} />
      )}

      <ol className="segment-list">
        {segments.map((segment, i) =>
          editing?.kind === 'edit' && editing.id === segment.id ? (
            <li key={segment.id}>
              <SegmentForm
                segment={segment}
                currency={currency}
                onSave={(updated) => {
                  void save(segments.map((s) => (s.id === updated.id ? updated : s)))
                  setEditing(null)
                }}
                onSaveAndDraw={
                  hasGoogleKey
                    ? async (updated) => {
                        const next = segments.map((s) => (s.id === updated.id ? updated : s))
                        await save(next)
                        setEditing(null)
                        startDrawing(next, i)
                      }
                    : undefined
                }
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={segment.id}>
              <SegmentView segment={segment} notes={segment.notes} />
              <div className="row wrap segment-actions">
                <button type="button" className="link" onClick={() => setEditing({ kind: 'edit', id: segment.id })}>
                  Edit
                </button>
                {hasGoogleKey && (
                  <button type="button" className="link" onClick={() => startDrawing(segments, i)}>
                    {segment.path.length > 1 ? 'Redraw on map' : 'Draw on map'}
                  </button>
                )}
                <button type="button" className="link" disabled={i === 0} onClick={() => move(i, -1)}>
                  Up
                </button>
                <button type="button" className="link" disabled={i === segments.length - 1} onClick={() => move(i, 1)}>
                  Down
                </button>
                <button type="button" className="link" onClick={() => save(segments.filter((s) => s.id !== segment.id))}>
                  Remove
                </button>
              </div>
            </li>
          ),
        )}
      </ol>

      {editing?.kind === 'new' && (
        <SegmentForm
          currency={currency}
          defaults={{
            fromName: segments.at(-1)?.toName ?? from.name,
            toName: segments.length === 0 ? undefined : to.name,
          }}
          onSave={(segment) => {
            void save([...segments, segment])
            setEditing(null)
          }}
          onSaveAndDraw={
            hasGoogleKey
              ? async (segment) => {
                  const next = [...segments, segment]
                  await save(next)
                  setEditing(null)
                  startDrawing(next, next.length - 1)
                }
              : undefined
          }
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="row wrap">
        <a href={directionsUrl(from, to, segments)} target="_blank" rel="noreferrer">
          Open in Google Maps
        </a>
        {leg && (
          <button type="button" className="link" onClick={() => deleteLeg(leg.id)}>
            Clear this leg
          </button>
        )}
      </div>
    </div>
  )
}

function Alternatives({ leg, options, from, to, date }: { leg: Leg; options: RouteOption[]; from: Place; to: Place; date: string }) {
  return (
    <details className="alternatives">
      <summary>
        Other suggestions ({options.length})
        {leg.alternativesDate && leg.alternativesDate !== date && (
          <span className="muted small"> · times for {formatDay(leg.alternativesDate)}</span>
        )}
      </summary>
      <ul>
        {options.map((option, i) => (
          <li key={i}>
            <span>
              {option.segments.map((s) => MODE_ICON[s.mode]).join(' ')} · {formatDuration(option.durationMinutes)}
              {option.fare && ` · ${formatMoney(option.fare)}`} · {option.transfers ?? 0} transfer(s)
            </span>
            <button type="button" className="link" onClick={() => chooseAlternative(leg, option, from, to)}>
              Use
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}

/** Sum of the segment fares, one value per currency. */
function totalFares(segments: Segment[]): Money[] {
  const totals: Record<string, number> = {}
  for (const fare of segments.map((s) => s.fare)) {
    if (fare) totals[fare.currency] = (totals[fare.currency] ?? 0) + fare.amount
  }
  return Object.entries(totals).map(([currency, amount]) => ({ amount, currency }))
}

function errorMessage(error: unknown): string {
  if (error instanceof RouteProviderError) {
    if (error.kind === 'not-configured') return `${error.message}`
    if (error.kind === 'quota') return 'Monthly request limit reached. You can still add segments manually.'
    return `${error.kind}: ${error.message}`
  }
  return error instanceof Error ? error.message : String(error)
}
