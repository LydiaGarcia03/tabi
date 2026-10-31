import { useState, type FormEvent } from 'react'
import { formatDay } from '../dates'
import type { Day, RailPass, Trip } from '../db/model'
import { updateTrip } from '../db/trips'
import { formatMoney } from '../format'
import { ALL_JR, JR_COMPANIES, type PassReport } from '../planning/railPasses'
import { CurrencyPicker } from './options/ChoosePanel'
import { Icon } from './Icon'
import { InfoTip } from './InfoTip'
import { Sheet } from './Sheet'

/**
 * "Rail passes" on the Budget page, for trips to Japan (User's choice 3-B from a mock, 2026-10-31): one card per pass
 * with what it covers of the days' fares (per person) and whether it pays off; "Use this pass" puts it in what is paid
 * before the trip and takes the fares it covers out of the days (struck through in the legs).
 */
export function RailPassesCard({
  trip,
  days,
  reports,
  companies,
  icCard,
}: {
  trip: Trip
  days: Day[]
  reports: PassReport[]
  companies: string[]
  /** Yen per person to load on an IC card (`icCardFares`). */
  icCard: number
}) {
  const [editing, setEditing] = useState<RailPass | 'new' | null>(null)
  const passes = trip.railPasses ?? []
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
  const save = (next: RailPass[]) => updateTrip(trip.id, { railPasses: next })
  const change = (id: string, changes: Partial<RailPass>) => save(passes.map((p) => (p.id === id ? { ...p, ...changes } : p)))

  return (
    <section className="card rail-passes">
      <div className="money-head">
        <p className="trip-money-kicker">
          <Icon name="ticket" size={16} /> Rail passes
        </p>
        <button type="button" className="link small" onClick={() => setEditing('new')}>
          <Icon name="plus" size={14} /> Add
        </button>
      </div>
      {reports.length === 0 && (
        <p className="muted small">Add a pass (JR Pass, Kansai Area Pass…) with its price: it's compared with the fares of your days' routes.</p>
      )}
      {reports.map((report) => {
        const { pass } = report
        return (
          <div key={pass.id} className={`rail-pass${pass.use ? ' in-use' : ''}`}>
            <div className="rail-pass-head">
              <strong>{pass.name}</strong>
              <Verdict report={report} />
              <button type="button" className="ghost icon-button" aria-label={`Edit ${pass.name}`} title="Edit" onClick={() => setEditing(pass)}>
                <Icon name="edit" size={16} />
              </button>
            </div>
            <p className="muted small">
              {pass.days} {pass.days === 1 ? 'day' : 'days'} · {pass.validOn.join(', ') || 'no company chosen'}
              {pass.shinkansen && ' · shinkansen'}
              {pass.price && ` · ${formatMoney(pass.price)} per person`}
            </p>
            <p className="small">
              Covers <strong>{formatMoney(report.covered)}</strong> of fares{' '}
              <span className="muted">
                ({report.rides} {report.rides === 1 ? 'ride' : 'rides'})
              </span>{' '}
              on{' '}
              <select
                className="compact small"
                aria-label="Days it is used"
                value={pass.startDate ?? ''}
                onChange={(e) => change(pass.id, { startDate: e.target.value || undefined })}
              >
                <option value="">
                  {dayRange(report.bestFirstDay, pass.days, sorted.length)} (most covered)
                </option>
                {sorted.slice(0, Math.max(1, sorted.length - pass.days + 1)).map((d, i) => (
                  <option key={d.id} value={d.date}>
                    {dayRange(i + 1, pass.days, sorted.length)} · from {formatDay(d.date)}
                  </option>
                ))}
              </select>
            </p>
            <div className="rail-pass-use">
              <label className="check">
                <input type="checkbox" role="switch" className="toggle" checked={!!pass.use} onChange={(e) => change(pass.id, { use: e.target.checked })} />
                Use this pass
              </label>
              {pass.use && (
                <label className="check small">
                  <input type="checkbox" checked={!!pass.booked} onChange={(e) => change(pass.id, { booked: e.target.checked })} />
                  Booked
                </label>
              )}
            </div>
          </div>
        )
      })}
      {icCard > 0 && (
        <p className="ic-card small">
          <Icon name="wallet" size={16} />
          <span>
            Load on your IC card (Suica): <strong>≈ {formatMoney({ amount: icCard, currency: 'JPY' })}</strong>{' '}
            <span className="muted">per person</span>
          </span>
          <InfoTip label="About the IC card" align="end">
            The fares of your days' trains, subways and buses that no pass in use covers. The shinkansen, taxis and flights are
            left out: they're usually paid apart.
          </InfoTip>
        </p>
      )}
      {editing && (
        <PassSheet
          trip={trip}
          pass={editing === 'new' ? undefined : editing}
          companies={companies}
          onClose={() => setEditing(null)}
          onSave={(pass) => {
            void save(passes.some((p) => p.id === pass.id) ? passes.map((p) => (p.id === pass.id ? pass : p)) : [...passes, pass])
            setEditing(null)
          }}
          onDelete={(id) => {
            void save(passes.filter((p) => p.id !== id))
            setEditing(null)
          }}
        />
      )}
    </section>
  )
}

/** "Days 3–5" (or "Day 3"). */
function dayRange(first: number, length: number, count: number): string {
  const last = Math.min(count, first + length - 1)
  return last > first ? `Days ${first}–${last}` : `Day ${first}`
}

function Verdict({ report }: { report: PassReport }) {
  if (report.saves == null) return <span className="tag">Add its price</span>
  const currency = report.covered.currency
  return report.saves >= 0 ? (
    <span className="tag ok-tag">Saves {formatMoney({ amount: report.saves, currency })}</span>
  ) : (
    <span className="tag alert-tag">Costs {formatMoney({ amount: -report.saves, currency })} more</span>
  )
}

const JR_CHOICES = [ALL_JR, ...Object.keys(JR_COMPANIES)]

/** Adding or changing a pass: name, days, price per person, the companies it is valid on, the shinkansen. */
function PassSheet({
  trip,
  pass,
  companies,
  onClose,
  onSave,
  onDelete,
}: {
  trip: Trip
  pass?: RailPass
  companies: string[]
  onClose: () => void
  onSave: (pass: RailPass) => void
  onDelete: (id: string) => void
}) {
  const [name, setName] = useState(pass?.name ?? '')
  const [days, setDays] = useState(String(pass?.days ?? 7))
  const [price, setPrice] = useState(pass?.price ? String(pass.price.amount) : '')
  const [currency, setCurrency] = useState(pass?.price?.currency ?? 'JPY')
  const [validOn, setValidOn] = useState<string[]>(pass?.validOn ?? [ALL_JR])
  const [shinkansen, setShinkansen] = useState(pass?.shinkansen ?? false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const dayCount = Number(days)
  const valid = name.trim() !== '' && Number.isInteger(dayCount) && dayCount >= 1 && validOn.length > 0
  const toggle = (company: string) => setValidOn(validOn.includes(company) ? validOn.filter((c) => c !== company) : [...validOn, company])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    const amount = Number(price)
    onSave({
      ...pass,
      id: pass?.id ?? crypto.randomUUID(),
      name: name.trim(),
      days: dayCount,
      price: price.trim() !== '' && Number.isFinite(amount) && amount >= 0 ? { amount, currency } : undefined,
      validOn,
      shinkansen: shinkansen || undefined,
    })
  }

  return (
    <Sheet title={pass ? pass.name : 'New rail pass'} onClose={onClose}>
      <form className="pass-sheet" onSubmit={submit}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kansai Area Pass" autoFocus={!pass} />
        </label>
        <div className="field-row">
          <label>
            Days
            <input type="number" min="1" step="1" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
          </label>
          <div>
            <span className="field-label">Price per person</span>
            <div className="add-trip-price">
              <input type="number" min="0" step="any" inputMode="decimal" aria-label="Price per person" value={price} onChange={(e) => setPrice(e.target.value)} />
              <CurrencyPicker trip={trip} value={currency} onChange={setCurrency} />
            </div>
          </div>
        </div>
        <div>
          <span className="field-label">Valid on</span>
          <div className="chip-picker">
            {[...JR_CHOICES, ...companies].map((company) => (
              <button
                key={company}
                type="button"
                className={validOn.includes(company) ? 'active' : undefined}
                aria-pressed={validOn.includes(company)}
                onClick={() => toggle(company)}
              >
                {company}
              </button>
            ))}
          </div>
          <p className="muted small">The companies of your routes are listed after the JR ones. Exceptions (like the Nozomi on the JR Pass) aren't checked: keep them in mind.</p>
        </div>
        <label className="check">
          <input type="checkbox" checked={shinkansen} onChange={(e) => setShinkansen(e.target.checked)} />
          Covers the shinkansen
        </label>
        <div className="row sheet-actions">
          <button type="submit" className="primary" disabled={!valid}>
            Save
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          {pass &&
            (confirmDelete ? (
              <button type="button" className="danger" onClick={() => onDelete(pass.id)}>
                Delete the pass
              </button>
            ) : (
              <button type="button" className="danger-outline" onClick={() => setConfirmDelete(true)}>
                Delete…
              </button>
            ))}
        </div>
      </form>
    </Sheet>
  )
}
