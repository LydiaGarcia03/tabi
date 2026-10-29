// Google Cloud requests used, read from Cloud Monitoring (the same numbers as the console's API pages, a few
// minutes late; every device together). Only for the API usage debug panel (`npm run dev`): it signs in with a
// read-only "see monitoring data" permission of its own, apart from Drive sync's.
// Cloud Monitoring reads are free up to 1 million time series a month; each refresh returns about 10.

import { loadJson, saveJson } from '../settings'
import { GOOGLE_CLIENT_ID, loadGoogleScript } from '../sync/googleAuth'

export const GOOGLE_CLOUD_PROJECT = import.meta.env.VITE_GOOGLE_CLOUD_PROJECT
/** The project owner's Google account (.env.local, never in the repo nor the published build). */
const GOOGLE_ACCOUNT = import.meta.env.VITE_GOOGLE_ACCOUNT
const MONITORING_SCOPE = 'https://www.googleapis.com/auth/monitoring.read'
/** `email` too, to say which account read it (the project's owner must be the one picked). */
const SCOPE = `${MONITORING_SCOPE} email`
const TOKEN_KEY = 'tabi.debug.monitoringToken'

export interface ServiceUsage {
  /** "places.googleapis.com" */
  service: string
  today: number
  month: number
  /** Per method ("SearchText"), this month. */
  methods: { method: string; month: number }[]
}

export class UsageError extends Error {
  /** The Cloud Monitoring API isn't turned on in the project. */
  readonly disabled: boolean
  constructor(message: string, disabled = false) {
    super(message)
    this.disabled = disabled
  }
}

interface StoredToken {
  token: string
  expiresAt: number
  email?: string
}

function storedToken(): StoredToken | null {
  const stored = loadJson<StoredToken>(TOKEN_KEY)
  return stored && stored.expiresAt - 60_000 > Date.now() ? stored : null
}

/** True when the usage can be read without opening Google's window (so without a tap). */
export function canFetchQuietly(): boolean {
  return storedToken() != null
}

/** The Google account the usage is read with ("" before the first read). */
export function usageAccount(): string {
  return loadJson<StoredToken>(TOKEN_KEY)?.email ?? ''
}

/**
 * A valid token, else Google's window asks which account and for the permission (must run from a tap). Checks the
 * monitoring box was ticked: Google lets each permission be left out.
 */
async function monitoringToken(): Promise<string> {
  const stored = storedToken()
  if (stored) return stored.token
  const clientId = GOOGLE_CLIENT_ID
  if (!clientId) throw new UsageError('VITE_GOOGLE_CLIENT_ID is missing in .env.local.')
  const oauth2 = await loadGoogleScript()
  const response = await new Promise<{ access_token: string; expires_in?: number }>((resolve, reject) => {
    oauth2
      .initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (r) => {
          if (r.access_token) resolve({ access_token: r.access_token, expires_in: r.expires_in })
          else reject(new UsageError(r.error_description || r.error || 'Google sign-in failed.'))
        },
        error_callback: (error) => reject(new UsageError(error.type === 'popup_closed' ? 'Sign-in window closed.' : error.message || 'Google sign-in failed.')),
      })
      // The project owner's account from .env.local comes preselected (still asked, in case it's another one).
      .requestAccessToken({ prompt: 'select_account consent', ...(GOOGLE_ACCOUNT ? { login_hint: GOOGLE_ACCOUNT } : {}) })
  })
  const info = (await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(response.access_token)}`)
    .then((r) => r.json())
    .catch(() => ({}))) as { scope?: string; email?: string }
  if (info.scope && !info.scope.split(' ').includes(MONITORING_SCOPE)) {
    throw new UsageError(`"See monitoring data" was left unticked${info.email ? ` (${info.email})` : ''}: try again and tick it.`)
  }
  saveJson(TOKEN_KEY, { token: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000, email: info.email })
  return response.access_token
}

/**
 * Requests per Google API today and this month. Days and months start at midnight Pacific time, when Google's
 * daily quotas reset.
 */
export async function fetchGoogleUsage(): Promise<ServiceUsage[]> {
  if (!GOOGLE_CLOUD_PROJECT) throw new UsageError('Add VITE_GOOGLE_CLOUD_PROJECT=<project ID> to .env.local and restart npm run dev.')
  const token = await monitoringToken()
  const now = new Date()
  const today = startOfPacificDay(now)
  const month = new Date(today.getTime() - (pacificDayOfMonth(now) - 1) * 86_400_000)
  const [day, wholeMonth] = await Promise.all([requestCounts(token, today, now), requestCounts(token, month, now)])

  const services = new Map<string, ServiceUsage>()
  for (const { service, method, count } of wholeMonth) {
    const usage = services.get(service) ?? { service, today: 0, month: 0, methods: [] }
    usage.month += count
    usage.methods.push({ method, month: count })
    services.set(service, usage)
  }
  for (const { service, count } of day) {
    const usage = services.get(service) ?? { service, today: 0, month: 0, methods: [] }
    usage.today += count
    services.set(service, usage)
  }
  for (const usage of services.values()) usage.methods.sort((a, b) => b.month - a.month)
  return [...services.values()].sort((a, b) => b.month - a.month)
}

interface TimeSeries {
  resource?: { labels?: Record<string, string> }
  points?: { value?: { int64Value?: string } }[]
}

/** request_count of every API the project used between `start` and `end`, per service and method. */
async function requestCounts(token: string, start: Date, end: Date): Promise<{ service: string; method: string; count: number }[]> {
  const seconds = Math.max(60, Math.round((end.getTime() - start.getTime()) / 1000))
  const params = new URLSearchParams({
    filter: 'metric.type="serviceruntime.googleapis.com/api/request_count" AND resource.type="consumed_api"',
    'interval.startTime': start.toISOString(),
    'interval.endTime': end.toISOString(),
    'aggregation.alignmentPeriod': `${seconds}s`,
    'aggregation.perSeriesAligner': 'ALIGN_SUM',
    'aggregation.crossSeriesReducer': 'REDUCE_SUM',
  })
  params.append('aggregation.groupByFields', 'resource.label.service')
  params.append('aggregation.groupByFields', 'resource.label.method')
  const response = await fetch(`https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(GOOGLE_CLOUD_PROJECT!)}/timeSeries?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string; status?: string } } | null
    const message = body?.error?.message ?? `HTTP ${response.status}`
    const disabled = response.status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(message)
    const account = usageAccount()
    // A token of the wrong account (or without the permission) is dropped: the next try asks again.
    if (response.status === 401 || (response.status === 403 && !disabled)) saveJson(TOKEN_KEY, null)
    const hint =
      response.status === 403 && !disabled
        ? ` Project "${GOOGLE_CLOUD_PROJECT}", account ${account || 'unknown'}: on the next try pick the account that owns the project (the one in the console's top right corner).`
        : ''
    throw new UsageError(message + hint, disabled)
  }
  const { timeSeries = [] } = (await response.json()) as { timeSeries?: TimeSeries[] }
  return timeSeries.map((series) => ({
    service: series.resource?.labels?.service ?? '?',
    method: (series.resource?.labels?.method ?? '?').split('.').pop() ?? '?',
    count: (series.points ?? []).reduce((sum, p) => sum + Number(p.value?.int64Value ?? 0), 0),
  }))
}

const PACIFIC = 'America/Los_Angeles'

function pacificParts(date: Date): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC, hourCycle: 'h23', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(date)
  return Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]))
}

function startOfPacificDay(date: Date): Date {
  const { hour, minute, second } = pacificParts(date)
  return new Date(date.getTime() - ((hour * 60 + minute) * 60 + second) * 1000 - date.getMilliseconds())
}

function pacificDayOfMonth(date: Date): number {
  return pacificParts(date).day
}
