import type { TripOption } from '../../db/model'
import type { ItineraryState } from '../OptionDetails'

/** What the Options page knows about the itinerary: the places and trip costs in it, and which are ticked "Booked". */
export interface ItineraryIds {
  placeIds: Set<string>
  expenseIds: Set<string>
  bookedIds: Set<string>
}

/** In a day (its place) or in the trip (its stay / journey), and whether that is ticked "Booked". */
export function itineraryState(option: TripOption, { placeIds, expenseIds, bookedIds }: ItineraryIds): ItineraryState {
  const id = option.placeId && placeIds.has(option.placeId) ? option.placeId : option.expenseId && expenseIds.has(option.expenseId) ? option.expenseId : null
  return id ? (bookedIds.has(id) ? 'booked' : 'in') : false
}