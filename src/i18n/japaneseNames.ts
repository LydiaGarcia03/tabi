// Translates Japanese station, line and operator names to their official
// English names using a dictionary built from Wikidata (see
// scripts/update-japanese-names.mjs). Works offline; names not in the
// dictionary are kept as they are (no machine translation of proper nouns).

import { distanceKm } from '../geo'
import type { LatLng, RouteResult, RouteSegment } from '../routing/types'

interface NameData {
  stations: [ja: string, en: string, lat: number, lng: number][]
  names: Record<string, string>
}

interface Dictionary {
  stations: Map<string, { en: string; lat: number; lng: number }[]>
  names: Map<string, string>
}

/** Homonym stations are told apart by distance; farther than this is not a match. */
const MAX_STATION_DISTANCE_KM = 3

const JAPANESE_TEXT = /[぀-ヿ㐀-鿿＀-￯]/

let dictionary: Promise<Dictionary> | null = null

function loadDictionary(): Promise<Dictionary> {
  // Lazy import: the dictionary is a separate chunk, only downloaded when needed.
  dictionary ??= import('../data/japanese-names.json').then(({ default: data }) => {
    const { stations, names } = data as unknown as NameData
    const byName = new Map<string, { en: string; lat: number; lng: number }[]>()
    for (const [ja, en, lat, lng] of stations) {
      const list = byName.get(ja) ?? []
      list.push({ en, lat, lng })
      byName.set(ja, list)
    }
    return { stations: byName, names: new Map(Object.entries(names)) }
  })
  return dictionary
}

/** Translates every Japanese name in a route result, keeping the originals. */
export async function translateRouteResult(result: RouteResult): Promise<RouteResult> {
  const needsWork = result.options.some((o) => o.segments.some((s) => !s.originalNames && hasJapanese(s)))
  if (!needsWork) return result

  const dict = await loadDictionary()
  return {
    ...result,
    options: result.options.map((option) => ({
      ...option,
      segments: option.segments.map((segment) =>
        segment.originalNames ? segment : translateSegment(dict, segment),
      ),
    })),
  }
}

function translateSegment(dict: Dictionary, segment: RouteSegment): RouteSegment {
  const lineName = translateLine(dict, segment.lineName)
  const operator = translateName(dict, segment.operator)
  const fromName = translateStation(dict, segment.fromName, segment.path[0])
  const toName = translateStation(dict, segment.toName, segment.path.at(-1))
  return {
    ...segment,
    lineName,
    operator,
    fromName,
    toName,
    originalNames: {
      line: lineName !== segment.lineName ? segment.lineName : undefined,
      operator: operator !== segment.operator ? segment.operator : undefined,
      from: fromName !== segment.fromName ? segment.fromName : undefined,
      to: toName !== segment.toName ? segment.toName : undefined,
    },
  }
}

function translateStation(dict: Dictionary, name: string | undefined, near: LatLng | undefined): string | undefined {
  if (!name || !JAPANESE_TEXT.test(name)) return name
  const key = withoutParentheses(normalize(name)).replace(/駅$/, '')
  const candidates = dict.stations.get(key)
  if (!candidates) return name
  if (!near) return candidates.length === 1 ? candidates[0].en : name

  let best: { en: string; km: number } | null = null
  for (const candidate of candidates) {
    const km = distanceKm(near, candidate)
    if (!best || km < best.km) best = { en: candidate.en, km }
  }
  return best && best.km <= MAX_STATION_DISTANCE_KM ? best.en : name
}

function translateLine(dict: Dictionary, name: string | undefined): string | undefined {
  const translated = translateName(dict, name)
  if (translated !== name || !name) return translated
  // NAVITIME prefixes JR lines ("JR山手線"); Wikidata often lists them without it.
  const normalized = normalize(name)
  if (normalized.startsWith('JR')) {
    const rest = translateName(dict, normalized.slice(2))
    if (rest !== normalized.slice(2)) return `JR ${rest}`
  }
  return name
}

function translateName(dict: Dictionary, name: string | undefined): string | undefined {
  if (!name || !JAPANESE_TEXT.test(name)) return name
  const normalized = normalize(name)
  return dict.names.get(normalized) ?? dict.names.get(withoutParentheses(normalized)) ?? name
}

function hasJapanese(segment: RouteSegment): boolean {
  return [segment.lineName, segment.operator, segment.fromName, segment.toName].some(
    (name) => name != null && JAPANESE_TEXT.test(name),
  )
}

/** Full-width to regular characters, e.g. "ＪＲ" → "JR", "（" → "(". */
function normalize(text: string): string {
  return text.normalize('NFKC').trim()
}

/** "神田(東京都)" → "神田" */
function withoutParentheses(text: string): string {
  return text.replace(/\s*\([^)]*\)\s*/g, '').trim()
}

/**
 * Station exits in English: "B4口" → "Exit B4", "7番出口" → "Exit 7".
 * Descriptive names (e.g. "明治通り側出入口") are returned unchanged.
 */
export function translateExit(exit: string): string {
  const match = /^([A-Z]?\d+[a-z]?)番?(?:出入?)?口$/i.exec(normalize(exit))
  return match ? `Exit ${match[1].toUpperCase()}` : exit
}
