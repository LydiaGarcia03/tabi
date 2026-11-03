import { useMemo } from 'react'
import type { Expense, Trip } from '../db/model'
import { useWorkHolidays, type WorkHolidays } from '../holidays/holidays'
import { useOnline } from '../useOnline'
import { countTimeOff, type TimeOffCount } from './timeOff'

/**
 * The trip's time off, once its work calendar is set (null before; undefined while the country's holidays load);
 * also the work calendar's regions, for the settings.
 */
export function useTimeOff(
  trip: Trip | null | undefined,
  expenses: Expense[] | undefined,
): { count: TimeOffCount | null | undefined; holidays?: WorkHolidays } {
  const online = useOnline()
  const country = trip?.timeOff?.country
  const holidays = useWorkHolidays(country, trip?.timeOff?.region, online)
  const count = useMemo(() => {
    if (!trip || !country) return null
    if (!holidays || !expenses) return undefined
    return countTimeOff(trip, expenses, holidays.dates)
  }, [trip, expenses, holidays, country])
  return { count, holidays }
}
