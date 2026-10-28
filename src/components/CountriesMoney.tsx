import { useState } from 'react'
import { COUNTRIES, countryName, CURRENCIES, currencyName } from '../data/countries'
import {
  addCountry,
  addCurrencies,
  goAbroad,
  refreshRates,
  removeCountry,
  removeCurrency,
  setDisplayCurrency,
  setMainCurrency,
  setRate,
  stayAtHome,
} from '../db/currencies'
import type { Trip, TripCurrency } from '../db/model'
import { formatDay } from '../dates'
import { formatMoney } from '../format'
import { tripCurrencies } from '../money/currencies'
import { hasPublishedRate } from '../money/rates'
import { useOnline } from '../useOnline'
import { Icon } from './Icon'

/**
 * Trip settings → "Countries & money" (User's choice D from a mock, 2026-10-28): in my country / abroad, "my
 * money" (where totals are shown), the countries, and abroad each currency with its rate (today's ECB rate filled
 * in, editable) and a quick check ("¥1,000 → R$34").
 */
export function CountriesMoney({ trip }: { trip: Trip }) {
  const currencies = tripCurrencies(trip)
  const [abroad, setAbroad] = useState(currencies.length > 0)
  const [busy, setBusy] = useState(false)
  const [addingCurrency, setAddingCurrency] = useState(false)
  const run = async (task: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await task()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="countries-money" aria-label="Countries and money">
      <h3>Countries &amp; money</h3>
      <div className="segmented" role="radiogroup" aria-label="Where">
        {[false, true].map((value) => (
          <button
            key={String(value)}
            type="button"
            role="radio"
            aria-checked={abroad === value}
            className={abroad === value ? 'active' : ''}
            onClick={() => {
              setAbroad(value)
              void run(() => (value ? goAbroad(trip.id) : stayAtHome(trip.id)))
            }}
          >
            {value ? 'Abroad' : 'In my country'}
          </button>
        ))}
      </div>

      <label>
        My money
        <select value={trip.displayCurrency} onChange={(e) => void run(() => setDisplayCurrency(trip.id, e.target.value))}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c} · {currencyName(c)}
            </option>
          ))}
        </select>
      </label>

      <div>
        <p className="field-label">Where</p>
        <CountryPicker
          selected={trip.countries ?? []}
          onAdd={(code) => void run(() => addCountry(trip.id, code, abroad))}
          onRemove={(code) => void run(() => removeCountry(trip.id, code))}
        />
        <p className="muted small">Place searches find these countries first.</p>
      </div>

      {abroad ? (
        <>
          {currencies.map((c) => (
            <CurrencyCard key={c.code} trip={trip} currency={c} main={c.code === trip.baseCurrency} several={currencies.length > 1} />
          ))}
          {currencies.length === 0 && <p className="muted small">Add the countries you're going to: their currencies come with them.</p>}
          <AddCurrency trip={trip} open={addingCurrency} setOpen={setAddingCurrency} onAdd={(code) => void run(() => addCurrencies(trip.id, [code]))} />
        </>
      ) : (
        <>
          <p className="countries-money-ok">
            <Icon name="check" size={16} /> Everything in {trip.displayCurrency}: no conversion.
          </p>
          <p className="muted small">
            Paying something in another currency?{' '}
            <button
              type="button"
              className="link"
              onClick={() => {
                setAbroad(true)
                setAddingCurrency(true)
              }}
            >
              Add a currency
            </button>
          </p>
        </>
      )}
      {busy && <p className="muted small">Saving…</p>}
    </section>
  )
}

/** One currency abroad: ★ main, its rate to "my money" (today's or typed), and what amounts become. */
function CurrencyCard({ trip, currency, main, several }: { trip: Trip; currency: TripCurrency; main: boolean; several: boolean }) {
  const online = useOnline()
  const [typing, setTyping] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [failed, setFailed] = useState(false)
  const display = trip.displayCurrency
  const published = hasPublishedRate(currency.code, display)
  const typed = typing != null ? Number(typing.replace(',', '.')) : currency.rate
  const preview = Number.isFinite(typed) && typed > 0 ? typed : 0

  const commit = (text: string) => {
    setTyping(null)
    const rate = Number(text.replace(',', '.'))
    if (text.trim() !== '' && Number.isFinite(rate) && rate > 0 && rate !== currency.rate) void setRate(trip.id, currency.code, rate)
  }
  const fetchToday = async () => {
    setFetching(true)
    setFailed(false)
    setFailed(!(await refreshRates(trip.id, [currency.code])))
    setFetching(false)
  }

  return (
    <div className="currency-card">
      <div className="currency-card-top">
        <strong>{currency.code}</strong>
        <span className="muted small">{currencyName(currency.code)}</span>
        <span className="currency-card-tools">
          {main ? (
            <span className="currency-main" title="New prices start in this currency">
              <Icon name="star" size={13} filled /> Main
            </span>
          ) : (
            <button type="button" className="link small" onClick={() => void setMainCurrency(trip.id, currency.code)}>
              Make main
            </button>
          )}
          {several && (
            <button type="button" className="ghost icon-button" aria-label={`Remove ${currency.code}`} onClick={() => void removeCurrency(trip.id, currency.code)}>
              <Icon name="close" size={15} />
            </button>
          )}
        </span>
      </div>
      <label className="currency-rate">
        1 {currency.code} =
        <input
          // A rate fetched or saved elsewhere replaces what the field shows.
          key={`${currency.rate}|${currency.rateDate ?? ''}`}
          inputMode="decimal"
          placeholder="Rate"
          defaultValue={currency.rate > 0 ? String(currency.rate) : ''}
          onChange={(e) => setTyping(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        {display}
      </label>
      <p className="muted small currency-source">
        {currency.rateDate ? `ECB rate of ${formatDay(currency.rateDate)}` : currency.rate > 0 ? 'Typed by you' : 'No rate yet'}
        {published ? (
          online && (
            <>
              {' · '}
              <button type="button" className="link small" disabled={fetching} onClick={() => void fetchToday()}>
                {fetching ? 'Getting it…' : currency.rateDate ? 'Update' : "Use today's rate"}
              </button>
            </>
          )
        ) : (
          <> · the European Central Bank doesn't publish it: type it</>
        )}
        {failed && <span className="error"> · couldn't get it now</span>}
      </p>
      {preview > 0 && <p className="currency-check small">{rateCheck(currency.code, display, preview)}</p>}
    </div>
  )
}

/** "¥1,000 → R$34 · ¥10,000 → R$337": round amounts that give at least 10 in "my money". */
function rateCheck(code: string, display: string, rate: number): string {
  let sample = 1
  while (sample * rate < 10 && sample < 1e9) sample *= 10
  const pair = (amount: number) => `${formatMoney({ amount, currency: code })} → ${formatMoney({ amount: Math.round(amount * rate), currency: display })}`
  return `${pair(sample)} · ${pair(sample * 10)}`
}

function AddCurrency({ trip, open, setOpen, onAdd }: { trip: Trip; open: boolean; setOpen: (open: boolean) => void; onAdd: (code: string) => void }) {
  const used = new Set([trip.displayCurrency, ...tripCurrencies(trip).map((c) => c.code)])
  if (!open) {
    return (
      <button type="button" className="link small countries-money-add" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} /> Add a currency
      </button>
    )
  }
  return (
    <label>
      Add a currency
      <select
        autoFocus
        value=""
        onChange={(e) => {
          if (e.target.value) onAdd(e.target.value)
          setOpen(false)
        }}
        onBlur={() => setOpen(false)}
      >
        <option value="">Choose…</option>
        {CURRENCIES.filter((c) => !used.has(c)).map((c) => (
          <option key={c} value={c}>
            {c} · {currencyName(c)}
          </option>
        ))}
      </select>
    </label>
  )
}

/** The trip's countries as chips, with "+ Country" opening a search by name. */
export function CountryPicker({ selected, onAdd, onRemove }: { selected: string[]; onAdd: (code: string) => void; onRemove: (code: string) => void }) {
  const [query, setQuery] = useState<string | null>(null)
  const text = query?.trim().toLowerCase() ?? ''
  const matches = text
    ? COUNTRIES.filter((c) => !selected.includes(c.code) && c.name.toLowerCase().includes(text))
        .sort((a, b) => Number(b.name.toLowerCase().startsWith(text)) - Number(a.name.toLowerCase().startsWith(text)))
        .slice(0, 6)
    : []
  const add = (code: string) => {
    onAdd(code)
    setQuery(null)
  }
  return (
    <div className="country-picker">
      <div className="chip-row">
        {selected.map((code) => (
          <span key={code} className="country-chip">
            {countryName(code)}
            <button type="button" aria-label={`Remove ${countryName(code)}`} onClick={() => onRemove(code)}>
              <Icon name="close" size={13} />
            </button>
          </span>
        ))}
        {query == null && (
          <button type="button" className="country-chip add" onClick={() => setQuery('')}>
            <Icon name="plus" size={13} /> Country
          </button>
        )}
      </div>
      {query != null && (
        <div className="country-search">
          <input
            autoFocus
            value={query}
            placeholder="Country name (e.g. Japan)"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery(null)
              if (e.key === 'Enter') {
                e.preventDefault()
                if (matches[0]) add(matches[0].code)
              }
            }}
          />
          {matches.length > 0 && (
            <ul className="country-results">
              {matches.map((c) => (
                <li key={c.code}>
                  <button type="button" onClick={() => add(c.code)}>
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="link small" onClick={() => setQuery(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
