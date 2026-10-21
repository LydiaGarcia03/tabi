import type { Money, SegmentMode } from './routing/types'

const tokyoTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })

export function formatTime(iso: string | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : tokyoTime.format(date)
}

export function formatDuration(minutes: number | undefined): string {
  if (minutes == null) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h} h ${m} min` : `${m} min`
}

export function formatDistance(meters: number | undefined): string {
  if (meters == null) return '—'
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
}

export function formatMoney(money: Money | undefined): string {
  if (!money) return '—'
  return new Intl.NumberFormat('en', { style: 'currency', currency: money.currency }).format(money.amount)
}

export const MODE_ICON: Record<SegmentMode, string> = {
  walk: '🚶',
  bus: '🚌',
  train: '🚆',
  shinkansen: '🚅',
  subway: '🚇',
  taxi: '🚕',
  ferry: '⛴️',
  other: '➡️',
}

export const MODE_LABEL: Record<SegmentMode, string> = {
  walk: '🚶 Walk',
  bus: '🚌 Bus',
  train: '🚆 Train',
  shinkansen: '🚅 Shinkansen',
  subway: '🚇 Subway',
  taxi: '🚕 Taxi',
  ferry: '⛴️ Ferry',
  other: '➡️ Other',
}

export const MODE_COLOR: Record<SegmentMode, string> = {
  // Bright blue, like walking in Google Maps: stands out on light and dark maps.
  walk: '#1a73e8',
  bus: '#16a34a',
  train: '#2563eb',
  shinkansen: '#0d9488',
  subway: '#9333ea',
  taxi: '#eab308',
  ferry: '#0891b2',
  other: '#f97316',
}

/**
 * Color a segment is drawn in: its line's color (e.g. the Ginza Line's
 * orange), except walking, which is always the walking blue (route
 * providers send walks in grays that vanish on the map).
 */
export function segmentColor(segment: { mode: SegmentMode; color?: string }): string {
  return segment.mode === 'walk' ? MODE_COLOR.walk : (segment.color ?? MODE_COLOR[segment.mode])
}
