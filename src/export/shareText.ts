// A day as plain text, for sharing in a chat app or e-mail.

import { describePlaceCost } from '../budget'
import { formatDay } from '../dates'
import { legKey } from '../db/legs'
import type { Day, Leg, Place } from '../db/model'
import { hoursText, segmentText } from './itinerary'

export function dayText(day: Day, number: number, places: Place[], legs: Map<string, Leg>, travelers: number): string {
  const lines = [`Day ${number} · ${formatDay(day.date)}${day.title ? ` — ${day.title}` : ''}`, '']
  places.forEach((place, i) => {
    const facts = [place.plannedTime, describePlaceCost(place, travelers)].filter(Boolean).join(' · ')
    lines.push(`${i + 1}. ${place.name}${facts ? ` (${facts})` : ''}`)
    if (place.address) lines.push(`   ${place.address}`)
    const hours = hoursText(place, day.date)
    if (hours) lines.push(`   ${hours}`)
    if (place.notes.trim()) lines.push(...place.notes.trim().split('\n').map((l) => `   ${l}`))
    const next = places[i + 1]
    const segments = next ? (legs.get(legKey(place.id, next.id))?.segments ?? []) : []
    for (const segment of segments) {
      lines.push(...segmentText(segment).split('\n').map((l, j) => (j === 0 ? `   ↓ ${l}` : `     ${l}`)))
    }
    lines.push('')
  })
  if (places.length === 0) lines.push('Nothing planned yet.')
  return lines.join('\n').trim()
}

/** Opens the phone's share sheet, or copies the text when sharing isn't available. Returns what happened. */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
    }
  }
  await navigator.clipboard.writeText(text)
  return 'copied'
}
