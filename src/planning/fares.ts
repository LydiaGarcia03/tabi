// Fares of a transport option: the same journey sold as Light, Classic,
// Flex… each with its bags, price and the day the price was seen.

import { daysBetween, today } from '../dates'
import type { OptionFare, TripOption } from '../db/model'

/** A price seen longer ago than this is shown muted: it has probably changed. */
export const STALE_PRICE_DAYS = 30

export function isStale(seenOn: string | undefined): boolean {
  return !!seenOn && daysBetween(seenOn, today()) > STALE_PRICE_DAYS
}

/**
 * The fares to edit. Options saved before fares existed have one price (and
 * maybe a fare name): it becomes the only fare, seen on the day it was added.
 */
export function faresOf(option: TripOption | undefined): OptionFare[] {
  if (option?.fares?.length) return option.fares
  if (option?.price || option?.journey?.fare) {
    return [{ name: option.journey?.fare, price: option.price, seenOn: option.createdAt?.slice(0, 10) }]
  }
  return []
}

/** The fare used for the price (the marked one, else the first). */
export function chosenFare(option: Pick<TripOption, 'fares' | 'fareIndex'>): OptionFare | undefined {
  const fares = option.fares ?? []
  return fares[option.fareIndex ?? 0] ?? fares[0]
}

/** Without empty rows; the chosen index follows its fare (0 when it was removed). */
export function cleanFares(fares: OptionFare[], index: number): { fares: OptionFare[]; index: number } {
  const kept = fares
    .map((f) => ({ ...f, name: f.name?.trim() || undefined, bags: f.bags?.trim() || undefined }))
    .map((f, i) => ({ fare: f, i }))
    .filter(({ fare }) => fare.name || fare.bags || fare.price)
  const at = kept.findIndex(({ i }) => i === index)
  return { fares: kept.map(({ fare }) => fare), index: at < 0 ? 0 : at }
}

/** "R$ 5.286" for the cheapest fare with a price, when there are several. */
export function cheapestFare(fares: OptionFare[]): OptionFare | undefined {
  return fares.filter((f) => f.price).sort((a, b) => a.price!.amount - b.price!.amount)[0]
}
