import { distanceKm } from '../geo'
import { retranslateSegments } from '../i18n/japaneseNames'
import type { RouteOption, RouteSegment } from '../routing/types'
import { db } from './db'
import type { Leg, Place, Segment } from './model'

/** Key of the leg between two places, for lookups in memory. */
export function legKey(fromPlaceId: string, toPlaceId: string): string {
  return `${fromPlaceId}>${toPlaceId}`
}

/** When a leg leaves and arrives (ISO), from the times of its segments (suggested routes have them). */
export function legTimes(segments: Segment[] | undefined): { depart?: string; arrive?: string } {
  return {
    depart: segments?.find((s) => s.departureTime)?.departureTime,
    arrive: segments?.findLast((s) => s.arrivalTime)?.arrivalTime,
  }
}

/** Walking speed used when a walk only has its minutes (same as the order optimizer). */
const WALK_METERS_PER_MINUTE = 75

/**
 * How far the day is walked: the walking steps of the legs along its route.
 * A walk counts its distance, else its drawn path, else its minutes at 4.5 km/h
 * (then `estimated`). Walks inside places (a big temple) aren't known.
 */
export function dayWalking(route: { id: string }[], legs: Map<string, Leg>): { meters: number; estimated: boolean } {
  let meters = 0
  let estimated = false
  for (let i = 1; i < route.length; i++) {
    for (const s of legs.get(legKey(route[i - 1].id, route[i].id))?.segments ?? []) {
      if (s.mode !== 'walk') continue
      if (s.distanceMeters) meters += s.distanceMeters
      else if (s.path.length > 1) meters += s.path.slice(1).reduce((sum, p, k) => sum + distanceKm(s.path[k], p) * 1000, 0)
      else if (s.durationMinutes) {
        meters += s.durationMinutes * WALK_METERS_PER_MINUTE
        estimated = true
      }
    }
  }
  return { meters, estimated }
}

type LegChanges =Partial<Omit<Leg, 'id' | 'tripId' | 'fromPlaceId' | 'toPlaceId'>>

/** Creates or updates the leg between two places. */
export async function saveLeg(tripId: string, fromPlaceId: string, toPlaceId: string, changes: LegChanges): Promise<void> {
  await db.transaction('rw', db.legs, async () => {
    const existing = await db.legs.where('[fromPlaceId+toPlaceId]').equals([fromPlaceId, toPlaceId]).first()
    if (existing) {
      await db.legs.update(existing.id, changes)
    } else {
      await db.legs.add({ id: crypto.randomUUID(), tripId, fromPlaceId, toPlaceId, segments: [], source: 'manual', ...changes })
    }
  })
}

/** Changes one segment of a leg; `changes` receives the current segment. */
export async function updateSegment(
  fromPlaceId: string,
  toPlaceId: string,
  segmentId: string,
  changes: (segment: Segment) => Partial<Segment>,
): Promise<void> {
  await db.transaction('rw', db.legs, async () => {
    const leg = await db.legs.where('[fromPlaceId+toPlaceId]').equals([fromPlaceId, toPlaceId]).first()
    if (!leg) return
    await db.legs.update(leg.id, {
      segments: leg.segments.map((s) => (s.id === segmentId ? { ...s, ...changes(s) } : s)),
    })
  })
}

export async function deleteLeg(id: string): Promise<void> {
  await db.legs.delete(id)
}

/**
 * Turns provider segments into stored segments, naming the ends after the
 * user's places (NAVITIME calls them "start" and "goal").
 */
export function toSegments(routeSegments: RouteSegment[], from: Place, to: Place): Segment[] {
  return routeSegments.map((segment, i) => ({
    ...segment,
    id: crypto.randomUUID(),
    fromName: i === 0 && isPlaceholder(segment.fromName) ? from.name : segment.fromName,
    toName: i === routeSegments.length - 1 && isPlaceholder(segment.toName) ? to.name : segment.toName,
  }))
}

/** Uses one of the stored suggestions as the leg's segments (no request). */
export async function chooseAlternative(leg: Leg, option: RouteOption, from: Place, to: Place): Promise<void> {
  await db.legs.update(leg.id, { segments: toSegments(option.segments, from, to), source: 'navitime' })
}

/** Translates names saved in Japanese with the current dictionary and rules (no request). */
export async function retranslateLeg(leg: Leg): Promise<void> {
  const segments = await retranslateSegments(leg.segments)
  const alternatives = leg.alternatives && (await Promise.all(leg.alternatives.map((o) => retranslateSegments(o.segments))))
  if (!segments && !alternatives?.some(Boolean)) return
  await db.legs.update(leg.id, {
    ...(segments && { segments }),
    ...(alternatives?.some(Boolean) && {
      alternatives: leg.alternatives!.map((option, i) => (alternatives[i] ? { ...option, segments: alternatives[i] } : option)),
    }),
  })
}

function isPlaceholder(name: string | undefined): boolean {
  return !name || name === 'start' || name === 'goal'
}
