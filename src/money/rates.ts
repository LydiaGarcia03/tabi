// Today's exchange rates from Frankfurter (European Central Bank reference rates, updated on working days):
// free, no key, no account, so it can never bill. Only fills a field the user can still edit; never needed.

// The current address: the old api.frankfurter.app redirects here without CORS headers, which browsers block.
const BASE = 'https://api.frankfurter.dev/v1'
const TIMEOUT_MS = 10_000

/** Currencies the European Central Bank publishes (Frankfurter's /currencies on 2026-10-28; others are typed by hand). */
export const ECB_CURRENCIES = new Set([
  'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'ISK',
  'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR',
])

export function hasPublishedRate(from: string, to: string): boolean {
  return ECB_CURRENCIES.has(from) && ECB_CURRENCIES.has(to)
}

/** 1 `from` = rate `to`, with the date of that rate; null when it isn't published or can't be fetched. */
export async function fetchRate(from: string, to: string): Promise<{ rate: number; date: string } | null> {
  if (from === to) return { rate: 1, date: new Date().toISOString().slice(0, 10) }
  if (!hasPublishedRate(from, to) || !navigator.onLine) return null
  try {
    const response = await fetch(`${BASE}/latest?from=${from}&to=${to}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) return null
    const data = (await response.json()) as { date?: string; rates?: Record<string, number> }
    const rate = data.rates?.[to]
    return rate && data.date ? { rate, date: data.date } : null
  } catch {
    return null
  }
}
