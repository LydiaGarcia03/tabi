import { addDays } from '../dates'
import { getRapidApiKey } from '../settings'
import { createNavitimeProvider } from './navitimeProvider'

export const navitimeProvider = createNavitimeProvider(getRapidApiKey)

/** How far ahead suggestions use the real trip date. */
const MAX_DAYS_AHEAD = 60

/**
 * Date to ask route suggestions for. Providers only know current lines and
 * schedules, so for a trip far in the future we ask for the next same
 * weekday instead (times are estimates anyway; lines and fares are current).
 */
export function suggestionDate(tripDate: string, today = new Date().toISOString().slice(0, 10)): string {
  if (tripDate >= today && tripDate <= addDays(today, MAX_DAYS_AHEAD)) return tripDate
  const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay()
  let date = addDays(today, 1)
  while (weekday(date) !== weekday(tripDate)) date = addDays(date, 1)
  return date
}
