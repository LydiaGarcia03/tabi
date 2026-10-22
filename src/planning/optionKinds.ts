import type { BookAhead, OptionKind, OptionStatus, PlaceKind } from '../db/model'

export const OPTION_KINDS: OptionKind[] = ['hotel', 'restaurant', 'place', 'shop', 'transport']

/** Kinds of options that become places of a day, priced per person (hotels and transport are booked instead). */
export const DAY_KINDS: OptionKind[] = ['restaurant', 'place', 'shop']

export const PLACE_KINDS: PlaceKind[] = ['place', 'restaurant', 'shop', 'other']

export const PLACE_KIND_LABEL: Record<PlaceKind, string> = {
  place: '⛩️ Place',
  restaurant: '🍜 Restaurant',
  shop: '🛍️ Shop',
  other: '📦 Other',
}

export const KIND_ICON: Record<OptionKind, string> = {
  hotel: '🏨',
  restaurant: '🍜',
  place: '⛩️',
  shop: '🛍️',
  transport: '✈️',
}

export const KIND_PLURAL: Record<OptionKind, string> = {
  hotel: 'Hotels',
  restaurant: 'Restaurants',
  place: 'Places',
  shop: 'Shops',
  transport: 'Transport',
}

export const KIND_SINGULAR: Record<OptionKind, string> = {
  hotel: 'Hotel',
  restaurant: 'Restaurant',
  place: 'Place',
  shop: 'Shop',
  transport: 'Transport',
}

/** What the price means for each kind. */
export const PRICE_LABEL: Record<OptionKind, string> = {
  hotel: 'Price per night',
  restaurant: 'Price per person',
  place: 'Ticket',
  shop: 'Budget',
  transport: 'Price per ticket',
}

/** Common types, picked with one tap (anything else can be typed). */
export const CATEGORY_PRESETS: Record<OptionKind, string[]> = {
  hotel: ['Business hotel', 'Ryokan', 'Resort', 'Hostel', 'Capsule hotel', 'Apartment'],
  restaurant: ['Ramen', 'Sushi', 'Izakaya', 'Yakiniku', 'Café', 'Street food'],
  place: ['Temple / shrine', 'Museum', 'Park / garden', 'Viewpoint', 'Theme park', 'Neighborhood'],
  shop: ['Anime / manga', 'Souvenirs', 'Records', 'Fashion', 'Department store', 'Market'],
  transport: [],
}

/** What has to be arranged before going, for the kinds that can need it. */
export const BOOK_AHEAD_FOR: Partial<Record<OptionKind | PlaceKind, BookAhead>> = {
  restaurant: 'reservation',
  place: 'ticket',
}

export const BOOK_AHEAD_LABEL: Record<BookAhead, string> = {
  reservation: 'Reservation needed',
  ticket: 'Ticket needed',
  either: 'Ticket/Reservation needed',
}

export const BOOKED_LABEL: Record<BookAhead, string> = {
  reservation: 'Reserved',
  ticket: 'Ticket bought',
  either: 'Booked',
}

/** The checklist reminder: "Book a table" / "Buy tickets". */
export const BOOK_AHEAD_TODO: Record<BookAhead, string> = {
  reservation: 'Book a table',
  ticket: 'Buy tickets',
  either: 'Book / buy tickets',
}

export const STATUS_LABEL: Record<OptionStatus, string> = {
  idea: 'Idea',
  favorite: 'Favorite',
  chosen: 'Chosen',
  discarded: 'Discarded',
}
