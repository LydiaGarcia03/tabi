import type { OptionKind, OptionStatus } from '../db/model'

export const OPTION_KINDS: OptionKind[] = ['hotel', 'restaurant', 'place', 'shop', 'flight']

export const KIND_ICON: Record<OptionKind, string> = {
  hotel: '🏨',
  restaurant: '🍜',
  place: '⛩️',
  shop: '🛍️',
  flight: '✈️',
}

export const KIND_PLURAL: Record<OptionKind, string> = {
  hotel: 'Hotels',
  restaurant: 'Restaurants',
  place: 'Places',
  shop: 'Shops',
  flight: 'Flights',
}

export const KIND_SINGULAR: Record<OptionKind, string> = {
  hotel: 'Hotel',
  restaurant: 'Restaurant',
  place: 'Place',
  shop: 'Shop',
  flight: 'Flight',
}

/** What the price means for each kind. */
export const PRICE_LABEL: Record<OptionKind, string> = {
  hotel: 'Price per night',
  restaurant: 'Price per person',
  place: 'Ticket',
  shop: 'Budget',
  flight: 'Price per ticket',
}

export const CATEGORY_HINT: Record<OptionKind, string> = {
  hotel: 'Business hotel, ryokan, resort…',
  restaurant: 'Ramen, sushi, izakaya…',
  place: 'Temple, park, museum…',
  shop: 'Records, anime, souvenirs…',
  flight: 'Airline',
}

export const STATUS_LABEL: Record<OptionStatus, string> = {
  idea: 'Idea',
  favorite: 'Favorite',
  chosen: 'Chosen',
  discarded: 'Discarded',
}
