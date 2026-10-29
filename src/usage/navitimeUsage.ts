// How much of the NAVITIME plan (500 requests a month on RapidAPI) is used. RapidAPI says it on every response
// (x-ratelimit-requests-*), when the browser is allowed to read those headers; the requests this device sent are
// counted too, as a fallback. Read by the API usage debug panel.

import { loadJson, saveJson } from '../settings'

export interface NavitimeUsage {
  /** "2026-10": the count starts again each month. */
  month: string
  /** Requests sent from this device this month. */
  sent: number
  /** From RapidAPI's headers on the last response (account-wide), when readable. */
  limit?: number
  remaining?: number
  resetsAt?: string
  seenAt?: string
}

const KEY = 'tabi.navitimeUsage'

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

export function navitimeUsage(): NavitimeUsage {
  const saved = loadJson<NavitimeUsage>(KEY)
  return saved && saved.month === thisMonth() ? saved : { month: thisMonth(), sent: 0, ...(saved?.remaining != null ? lastSeen(saved) : {}) }
}

/** RapidAPI's own numbers stay useful after the month changes (they say when they were seen). */
function lastSeen(saved: NavitimeUsage): Partial<NavitimeUsage> {
  return { limit: saved.limit, remaining: saved.remaining, resetsAt: saved.resetsAt, seenAt: saved.seenAt }
}

/** After every NAVITIME request (a response of any status counts against the plan). */
export function recordNavitimeResponse(response: Response): void {
  const usage = navitimeUsage()
  const header = (name: string) => {
    const value = response.headers.get(`x-ratelimit-requests-${name}`)
    return value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : undefined
  }
  const remaining = header('remaining')
  const limit = header('limit')
  const reset = header('reset')
  saveJson(KEY, {
    ...usage,
    sent: usage.sent + 1,
    ...(remaining != null
      ? {
          remaining,
          limit,
          resetsAt: reset != null ? new Date(Date.now() + reset * 1000).toISOString() : undefined,
          seenAt: new Date().toISOString(),
        }
      : {}),
  })
}
