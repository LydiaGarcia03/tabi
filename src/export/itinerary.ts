// The trip as an ordered itinerary with plain-text descriptions, shared by
// the KML and GPX exports.

import { formatDay } from '../dates'
import { legKey } from '../db/legs'
import type { Day, Place, Segment } from '../db/model'
import type { TripData } from '../db/tripData'
import { orderPlaces } from '../db/trips'
import { MODE_COLOR, MODE_LABEL, formatDistance, formatDuration, formatMoney, formatTime } from '../format'
import { translateExit } from '../i18n/japaneseNames'

export interface ItineraryPoint {
  name: string
  description: string
  lat: number
  lng: number
}

export interface ItineraryLine {
  name: string
  description: string
  /** CSS hex color, "#rrggbb". */
  color: string
  path: { lat: number; lng: number }[]
}

export interface Itinerary {
  points: ItineraryPoint[]
  lines: ItineraryLine[]
}

/** Builds the itinerary of the given days (all days when `dayIds` is absent). */
export function buildItinerary(data: TripData, dayIds?: string[]): Itinerary {
  const legs = new Map(data.legs.map((l) => [legKey(l.fromPlaceId, l.toPlaceId), l]))
  const days = data.days.filter((d) => !dayIds || dayIds.includes(d.id))
  const points: ItineraryPoint[] = []
  const lines: ItineraryLine[] = []

  for (const day of days) {
    const dayNumber = data.days.indexOf(day) + 1
    // With several days, names start with the day so they sort and read well.
    const prefix = days.length > 1 ? `D${dayNumber} ` : ''
    const places = orderPlaces(
      day,
      data.places.filter((p) => p.dayId === day.id),
    )
    places.forEach((place, i) => {
      const previous = places[i - 1]
      const arriving = previous ? (legs.get(legKey(previous.id, place.id))?.segments ?? []) : []
      points.push({
        name: `${prefix}${i + 1}. ${place.name}`,
        description: placeDescription(day, dayNumber, place, previous, arriving),
        lat: place.lat,
        lng: place.lng,
      })
      arriving
        .filter((s) => s.path.length > 1)
        .forEach((segment) => {
          lines.push({
            name: `${prefix}${i} → ${i + 1} ${MODE_LABEL[segment.mode]}${segment.lineName ? ` · ${segment.lineName}` : ''}`,
            description: segmentText(segment),
            color: toHexColor(segment.color) ?? MODE_COLOR[segment.mode],
            path: segment.path,
          })
        })
    })
  }
  return { points, lines }
}

function placeDescription(day: Day, dayNumber: number, place: Place, previous: Place | undefined, arriving: Segment[]): string {
  const parts = [`Day ${dayNumber} · ${formatDay(day.date)}${day.title ? ` · ${day.title}` : ''}`]
  if (place.plannedTime) parts.push(`Time: ${place.plannedTime}`)
  if (place.address) parts.push(place.address)
  if (place.cost) parts.push(`Cost: ${formatMoney(place.cost)}`)
  if (previous && arriving.length > 0) {
    parts.push(`How to get here from ${previous.name}:\n${arriving.map((s) => `• ${segmentText(s)}`).join('\n')}`)
  }
  if (place.notes.trim()) parts.push(place.notes.trim())
  return parts.join('\n\n')
}

/** One segment in one or two lines, e.g. "🚇 Ginza Line: Kanda (Exit 2) → Asakusa · 10:02–10:15 · 13 min · ¥178". */
export function segmentText(segment: Segment): string {
  const original = segment.originalNames
  let head = MODE_LABEL[segment.mode]
  if (segment.lineName) head += ` · ${segment.lineName}${original?.line ? ` ${original.line}` : ''}`
  if (segment.operator) head += ` (${segment.operator})`

  const stops =
    segment.fromName || segment.toName
      ? `${stopText(segment.fromName, original?.from, segment.fromExit)} → ${stopText(segment.toName, original?.to, segment.toExit)}`
      : ''
  const facts = [
    segment.departureTime ? `${formatTime(segment.departureTime)}–${formatTime(segment.arrivalTime)}` : '',
    segment.durationMinutes != null ? formatDuration(segment.durationMinutes) : '',
    segment.distanceMeters != null ? formatDistance(segment.distanceMeters) : '',
    segment.fare ? formatMoney(segment.fare) : '',
  ].filter(Boolean)

  return [head + (stops ? `: ${stops}` : ''), facts.join(' · '), segment.notes?.trim() ?? '']
    .filter(Boolean)
    .join('\n')
}

function stopText(name: string | undefined, original: string | undefined, exit: string | undefined): string {
  let text = name ?? '?'
  if (original && original !== name) text += ` ${original}`
  if (exit) text += ` (${translateExit(exit)})`
  return text
}

/** Normalizes provider colors ("#RGB", "#RRGGBB", "RRGGBB") to "#rrggbb". */
function toHexColor(color: string | undefined): string | undefined {
  const hex = color?.trim().replace(/^#/, '')
  if (!hex) return undefined
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`
  if (/^[0-9a-f]{3}$/i.test(hex)) return `#${[...hex].map((c) => c + c).join('').toLowerCase()}`
  return undefined
}
