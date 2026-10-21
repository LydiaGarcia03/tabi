import type { OptionKind, OptionStatus } from '../db/model'

export const OPTION_KINDS: OptionKind[] = ['hotel', 'restaurant', 'place', 'shop', 'transport']

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

export const STATUS_LABEL: Record<OptionStatus, string> = {
  idea: 'Idea',
  favorite: 'Favorite',
  chosen: 'Chosen',
  discarded: 'Discarded',
}
