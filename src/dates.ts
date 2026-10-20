// Calendar dates as "YYYY-MM-DD" strings, computed in UTC so the device's
// time zone never shifts a day.

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Every date from start to end, inclusive. Empty if end is before start. */
export function dateRange(start: string, end: string): string[] {
  const dates: string[] = []
  for (let date = start; date <= end && dates.length < 366; date = addDays(date, 1)) dates.push(date)
  return dates
}

const dayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
const fullFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })

/** "Mon 3 Apr" */
export function formatDay(date: string): string {
  return dayFormat.format(new Date(`${date}T00:00:00Z`))
}

/** "3 Apr 2028" */
export function formatDate(date: string): string {
  return fullFormat.format(new Date(`${date}T00:00:00Z`))
}
