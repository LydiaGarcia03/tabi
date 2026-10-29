import { useEffect, useState } from 'react'
import { canFetchQuietly, fetchGoogleUsage, GOOGLE_CLOUD_PROJECT, usageAccount, UsageError, type ServiceUsage } from '../../usage/googleUsage'
import { navitimeUsage } from '../../usage/navitimeUsage'

/** Google APIs the app uses, with the daily quotas to set when the free trial ends (see CLAUDE.md). */
const SERVICES: Record<string, { label: string; daily?: number }> = {
  'maps-backend.googleapis.com': { label: 'Maps JavaScript API (map loads)', daily: 300 },
  'places.googleapis.com': { label: 'Places API (New)', daily: 100 },
  'routes.googleapis.com': { label: 'Routes API', daily: 100 },
  'drive.googleapis.com': { label: 'Drive API (sync, free)' },
  'monitoring.googleapis.com': { label: 'Cloud Monitoring (this panel)' },
}

const dateTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const dateOnly = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

/** Debug feature: requests used this month, Google Cloud (from Cloud Monitoring) and NAVITIME (from RapidAPI). */
export function ApiUsagePanel() {
  return (
    <div className="api-usage small">
      <GoogleUsage />
      <NavitimeUsage />
    </div>
  )
}

function GoogleUsage() {
  // Without a tap Google's window can't open: read at once only when the permission is still valid.
  const [quiet] = useState(canFetchQuietly)
  const [usage, setUsage] = useState<ServiceUsage[] | null>(null)
  const [busy, setBusy] = useState(quiet)
  const [error, setError] = useState<UsageError | null>(null)
  const [readAt, setReadAt] = useState<Date | null>(null)

  function show(result: ServiceUsage[]) {
    setUsage(result)
    setReadAt(new Date())
    setBusy(false)
  }

  function fail(err: unknown) {
    setError(err instanceof UsageError ? err : new UsageError(err instanceof Error ? err.message : String(err)))
    setBusy(false)
  }

  function load() {
    setBusy(true)
    setError(null)
    fetchGoogleUsage().then(show, fail)
  }

  useEffect(() => {
    if (quiet) fetchGoogleUsage().then(show, fail)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the panel opens
  }, [quiet])

  const project = GOOGLE_CLOUD_PROJECT ? `?project=${encodeURIComponent(GOOGLE_CLOUD_PROJECT)}` : ''
  return (
    <section className="api-usage-part">
      <div className="row between">
        <strong>Google Cloud</strong>
        <button type="button" className="link" onClick={load} disabled={busy}>
          {busy ? 'Reading…' : usage ? 'Refresh' : 'Read usage'}
        </button>
      </div>
      {error && (
        <p className="error">
          {error.message}
          {error.disabled && (
            <>
              {' '}
              <a href={`https://console.cloud.google.com/apis/library/monitoring.googleapis.com${project}`} target="_blank" rel="noreferrer">
                Turn on the Cloud Monitoring API
              </a>
            </>
          )}
        </p>
      )}
      {!usage && !error && !busy && <p className="muted">Asks which Google account (pick the project's owner) and for a read-only "see monitoring data" permission.</p>}
      {usage && (
        <table className="api-usage-table">
          <thead>
            <tr>
              <th>API</th>
              <th>Today</th>
              <th>Month</th>
            </tr>
          </thead>
          <tbody>
            {usage.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No requests this month.
                </td>
              </tr>
            )}
            {usage.map((s) => {
              const known = SERVICES[s.service]
              const over = known?.daily != null && s.today >= known.daily * 0.8
              return (
                <tr key={s.service}>
                  <td>
                    {known?.label ?? s.service}
                    <div className="muted">{s.methods.map((m) => `${m.method} ${m.month}`).join(' · ')}</div>
                  </td>
                  <td className={over ? 'warning' : undefined}>
                    {s.today}
                    {known?.daily != null && <span className="muted"> / {known.daily}</span>}
                  </td>
                  <td>{s.month.toLocaleString('en')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p className="muted">
        {readAt && (
          <>
            Read {dateTime.format(readAt)}
            {usageAccount() && <> as {usageAccount()}</>}; Google's numbers are a few minutes late.{' '}
          </>
        )}
        "Today" starts at midnight Pacific time, when Google's daily quotas reset; "/ 300" is the daily quota to set after the
        trial. Free each month per SKU: Essentials 10,000 · Pro 5,000 · Enterprise 1,000.{' '}
        <a href={`https://console.cloud.google.com/google/maps-apis/quotas${project}`} target="_blank" rel="noreferrer">
          Quotas
        </a>{' '}
        ·{' '}
        <a href={`https://console.cloud.google.com/google/maps-apis/metrics${project}`} target="_blank" rel="noreferrer">
          Metrics
        </a>
      </p>
    </section>
  )
}

function NavitimeUsage() {
  const usage = navitimeUsage()
  return (
    <section className="api-usage-part">
      <strong>NAVITIME (RapidAPI)</strong>
      {usage.remaining != null ? (
        <p>
          <span className="api-usage-big">{usage.remaining}</span> of {usage.limit ?? 500} left
          <span className="muted">
            {usage.resetsAt && <> · starts again {dateOnly.format(new Date(usage.resetsAt))}</>}
            {usage.seenAt && <> · as of {dateTime.format(new Date(usage.seenAt))} (the last route asked here)</>}
          </span>
        </p>
      ) : (
        <p className="muted">
          RapidAPI's own count (every device) comes with each route asked: ask one here, on a day's leg ("Route by
          NAVITIME"), and it shows up.
        </p>
      )}
      <p className="muted">
        This browser sent {usage.sent} this month.{' '}
        {/* Its chart counts every call (Time Range "Last 30 days" for the month). Sign in by email: the Google button often times out. */}
        <a href="https://rapidapi.com/developer/dashboard" target="_blank" rel="noreferrer">
          RapidAPI dashboard
        </a>
      </p>
    </section>
  )
}
