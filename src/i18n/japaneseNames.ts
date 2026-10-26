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
  if (!result.options.some((o) => o.segments.some(hasJapanese))) return result
  const dict = await loadDictionary()
  return {
    ...result,
    options: result.options.map((option) => ({
      ...option,
      segments: option.segments.map((segment) => translateSegment(dict, segment)),
    })),
  }
}

/**
 * Translates the names still in Japanese in saved segments (the dictionary or
 * the rules may have improved since they were saved). Null when nothing changes.
 */
export async function retranslateSegments<T extends RouteSegment>(segments: T[]): Promise<T[] | null> {
  if (!segments.some((s) => hasJapanese(s) || s.originalNames)) return null
  const dict = await loadDictionary()
  const translated = segments.map((segment) => translateSegment(dict, segment))
  return translated.some((segment, i) => segment !== segments[i]) ? translated : null
}

/**
 * Translates from the provider's names (the originals kept by an earlier
 * translation, else the current ones), so better rules also fix saved
 * segments. Same object back when nothing changes.
 */
function translateSegment<T extends RouteSegment>(dict: Dictionary, segment: T): T {
  const before = segment.originalNames ?? {}
  const source = {
    line: before.line ?? segment.lineName,
    operator: before.operator ?? segment.operator,
    from: before.from ?? segment.fromName,
    to: before.to ?? segment.toName,
    service: before.service ?? segment.service,
    headsign: before.headsign ?? segment.headsign,
    carHint: before.carHint ?? segment.carHint,
  }
  const line = translateLine(dict, source.line)
  const operator = translateName(dict, source.operator)
  const fromName = translateStation(dict, source.from, segment.fromCoord ?? segment.path[0])
  const toName = translateStation(dict, source.to, segment.toCoord ?? segment.path.at(-1))
  // The type glued to the line name is the precise one: NAVITIME's `type` says
  // 快速 (Rapid) for a 新快速 (Special Rapid).
  const service = line.service ?? translateService(source.service)
  const headsign = translateStation(dict, source.headsign, segment.toCoord ?? segment.path.at(-1), Infinity)
  const carHint = translateCarHint(source.carHint)
  // JR West signs write its station numbers "JR-A47"; NAVITIME gives "A47".
  const jrWest = /西日本/.test(source.operator ?? '')
  const code = (c: string | undefined) => (jrWest && c && /^[A-Z]\d/.test(c) ? `JR-${c}` : c)
  const intermediateStops = segment.intermediateStops?.map((stop) => {
    const name = translateStation(dict, stop.original ?? stop.name, stop.coord) ?? stop.name
    return name === stop.name ? stop : { ...stop, name, original: stop.original ?? stop.name }
  })

  const original = (now: string | undefined, from: string | undefined) => (now !== from ? from : undefined)
  const next = {
    ...segment,
    lineName: line.name,
    operator,
    fromName,
    toName,
    fromCode: code(segment.fromCode),
    toCode: code(segment.toCode),
    service,
    headsign,
    carHint,
    intermediateStops,
    originalNames: {
      line: original(line.name, source.line),
      operator: original(operator, source.operator),
      from: original(fromName, source.from),
      to: original(toName, source.to),
      service: line.service ? line.serviceJa : original(service, source.service),
      headsign: original(headsign, source.headsign),
      carHint: original(carHint, source.carHint),
    },
  }
  const changed =
    (['lineName', 'operator', 'fromName', 'toName', 'fromCode', 'toCode', 'service', 'headsign', 'carHint'] as const).some(
      (key) => next[key] !== segment[key],
    ) ||
    JSON.stringify(next.originalNames) !== JSON.stringify(segment.originalNames ?? next.originalNames) ||
    intermediateStops?.some((stop, i) => stop !== segment.intermediateStops?.[i])
  return changed ? next : segment
}

function translateStation(
  dict: Dictionary,
  name: string | undefined,
  near: LatLng | undefined,
  maxKm = MAX_STATION_DISTANCE_KM,
): string | undefined {
  if (!name || !JAPANESE_TEXT.test(name)) return name
  const key = stationKey(name)
  const candidates = dict.stations.get(key) ?? dict.stations.get(STATION_ALIASES[key] ?? '')
  if (!candidates) return name
  if (!near) return candidates.length === 1 ? candidates[0].en : name

  let best: { en: string; km: number } | null = null
  for (const candidate of candidates) {
    const km = distanceKm(near, candidate)
    if (!best || km < best.km) best = { en: candidate.en, km }
  }
  return best && best.km <= maxKm ? best.en : name
}

/** "なんば〔Osaka Metro〕" → "なんば", "丸太町（京都市営）" → "丸太町", "新宿駅" → "新宿". */
function stationKey(name: string): string {
  return withoutParentheses(normalize(name)).replace(/駅$/, '')
}

/** Kana spellings stations are often given in, mapped to the kanji in the dictionary. */
const STATION_ALIASES: Record<string, string> = {
  なんば: '難波',
}

/**
 * NAVITIME glues the operator in front ("OsakaMetro四つ橋線", "京都市営烏丸線")
 * and the train type after ("JR京都線新快速"); the dictionary has the bare line.
 */
function translateLine(
  dict: Dictionary,
  name: string | undefined,
): { name: string | undefined; service?: string; serviceJa?: string } {
  if (!name || !JAPANESE_TEXT.test(name)) return { name }
  let rest = withoutParentheses(normalize(name))
  const type = TRAIN_TYPE_SUFFIXES.find((suffix) => rest.endsWith(suffix) && rest.length > suffix.length)
  const service = type && TRAIN_TYPES[type]
  if (type) rest = rest.slice(0, -type.length)

  const whole = lookupLine(dict, rest)
  if (whole) return { name: whole, service, serviceJa: type }
  // Drop the operator prefix: the longest ending (3+ characters) that is a known line.
  for (let i = 1; i <= rest.length - 3; i++) {
    const found = lookupLine(dict, rest.slice(i))
    if (found) return { name: found, service, serviceJa: type }
  }
  return { name: service ? rest : name, service, serviceJa: type }
}

function translateName(dict: Dictionary, name: string | undefined): string | undefined {
  if (!name || !JAPANESE_TEXT.test(name)) return name
  const normalized = normalize(name)
  return dict.names.get(normalized) ?? dict.names.get(withoutParentheses(normalized)) ?? name
}

function lookupLine(dict: Dictionary, name: string): string | undefined {
  const alias = LINE_ALIASES[name]
  if (alias) return alias
  const direct = dict.names.get(name)
  if (direct) return direct
  // NAVITIME prefixes JR lines ("JR山手線"); Wikidata often lists them without it.
  if (name.startsWith('JR')) {
    const rest = dict.names.get(name.slice(2))
    if (rest) return `JR ${rest}`
  }
  return undefined
}

/** Line nicknames used on signs that Wikidata doesn't list under that name. */
const LINE_ALIASES: Record<string, string> = {
  JR京都線: 'JR Kyoto Line',
  JR神戸線: 'JR Kobe Line',
  JR宝塚線: 'JR Takarazuka Line',
  JR東西線: 'JR Tōzai Line',
  JR琵琶湖線: 'Biwako Line',
  琵琶湖線: 'Biwako Line',
  JRゆめ咲線: 'JR Yumesaki Line',
  JR難波線: 'JR Namba Line',
  学研都市線: 'Gakkentoshi Line',
  JR学研都市線: 'Gakkentoshi Line',
  大和路線: 'Yamatoji Line',
  JR大和路線: 'Yamatoji Line',
  JR嵯峨野線: 'Sagano Line',
  嵯峨野線: 'Sagano Line',
  JR奈良線: 'JR Nara Line',
  JR湖西線: 'Kosei Line',
}

/** Train types in English, as on the signs. */
const TRAIN_TYPES: Record<string, string> = {
  普通: 'Local',
  各駅停車: 'Local',
  各停: 'Local',
  快速: 'Rapid',
  新快速: 'Special Rapid',
  特別快速: 'Special Rapid',
  区間快速: 'Regional Rapid',
  通勤快速: 'Commuter Rapid',
  関空快速: 'Kansai Airport Rapid',
  紀州路快速: 'Kishuji Rapid',
  快速急行: 'Rapid Express',
  急行: 'Express',
  区間急行: 'Sub-Express',
  通勤急行: 'Commuter Express',
  準急: 'Semi-Express',
  区間準急: 'Section Semi-Express',
  特急: 'Limited Express',
  快速特急: 'Rapid Limited Express',
  快特: 'Rapid Limited Express',
  通勤特急: 'Commuter Limited Express',
  準特急: 'Semi-Limited Express',
  空港急行: 'Airport Express',
}

/** Longest first, so "新快速" wins over "快速". */
const TRAIN_TYPE_SUFFIXES = Object.keys(TRAIN_TYPES).sort((a, b) => b.length - a.length)

/** Named trains (shinkansen and limited expresses), "のぞみ123号" → "Nozomi 123". */
const NAMED_TRAINS: Record<string, string> = {
  のぞみ: 'Nozomi',
  ひかり: 'Hikari',
  こだま: 'Kodama',
  みずほ: 'Mizuho',
  さくら: 'Sakura',
  つばめ: 'Tsubame',
  はやぶさ: 'Hayabusa',
  はやて: 'Hayate',
  やまびこ: 'Yamabiko',
  なすの: 'Nasuno',
  こまち: 'Komachi',
  つばさ: 'Tsubasa',
  とき: 'Toki',
  たにがわ: 'Tanigawa',
  かがやき: 'Kagayaki',
  はくたか: 'Hakutaka',
  あさま: 'Asama',
  つるぎ: 'Tsurugi',
  はるか: 'Haruka',
  サンダーバード: 'Thunderbird',
  成田エクスプレス: "Narita Express (N'EX)",
}

function translateService(service: string | undefined): string | undefined {
  if (!service || !JAPANESE_TEXT.test(service)) return service
  const text = normalize(service)
  if (TRAIN_TYPES[text]) return TRAIN_TYPES[text]
  const named = /^(\D+?)(\d+)号?$/.exec(text)
  if (named && NAMED_TRAINS[named[1]]) return `${NAMED_TRAINS[named[1]]} ${named[2]}`
  return NAMED_TRAINS[text] ?? service
}

/** "後" → "Rear of the train", "１・２・３" → "Cars 1–3", "1" → "Car 1". Unknown texts are kept. */
export function translateCarHint(hint: string | undefined): string | undefined {
  if (!hint) return hint
  const text = normalize(hint)
  const where: Record<string, string> = { 前: 'Front of the train', 中: 'Middle of the train', 後: 'Rear of the train', 後ろ: 'Rear of the train' }
  if (where[text]) return where[text]
  const cars = text.split(/[・,、]/).map(Number)
  if (cars.length > 0 && cars.every((n) => Number.isInteger(n) && n > 0)) {
    const consecutive = cars.every((n, i) => i === 0 || n === cars[i - 1] + 1)
    if (cars.length === 1) return `Car ${cars[0]}`
    return consecutive && cars.length > 2 ? `Cars ${cars[0]}–${cars.at(-1)}` : `Cars ${cars.join(', ')}`
  }
  return hint
}

function hasJapanese(segment: RouteSegment): boolean {
  return [
    segment.lineName,
    segment.operator,
    segment.fromName,
    segment.toName,
    segment.service,
    segment.headsign,
    segment.carHint,
    ...(segment.intermediateStops?.map((stop) => stop.name) ?? []),
  ].some((name) => name != null && JAPANESE_TEXT.test(name))
}

/** A Japanese station name as on the signs: "なんば〔Osaka Metro〕" → "なんば", "丸太町（京都市営）" → "丸太町". */
export function signName(japanese: string): string {
  return withoutParentheses(normalize(japanese)) || japanese
}

/** A Japanese line name as on the signs: "ＪＲ京都線新快速" → "JR京都線", "OsakaMetro四つ橋線" → "四つ橋線". */
export function lineSignName(japanese: string): string {
  let text = signName(japanese)
  const type = TRAIN_TYPE_SUFFIXES.find((suffix) => text.endsWith(suffix) && text.length > suffix.length)
  if (type) text = text.slice(0, -type.length)
  // An operator glued in front (but "JR" is part of the line's name).
  return text.replace(/^(?!JR)[A-Za-z][A-Za-z ]*(?=[^\x00-\x7f])/, '').replace(OPERATOR_PREFIX, '') || text
}

/** Subway operators NAVITIME writes before the line; the signs show the line alone ("烏丸線"). */
const OPERATOR_PREFIX = /^(東京メトロ|都営|大阪メトロ|(京都|横浜|名古屋|神戸|札幌|仙台|福岡)市営(地下鉄)?)(?=.+線)/

/** Full-width to regular characters, e.g. "ＪＲ" → "JR", "（" → "(". */
function normalize(text: string): string {
  return text.normalize('NFKC').trim()
}

/** "神田(東京都)" → "神田", "なんば〔Osaka Metro〕" → "なんば" */
function withoutParentheses(text: string): string {
  return text.replace(/\s*(\([^)]*\)|〔[^〕]*〕|【[^】]*】)\s*/g, '').trim()
}

/**
 * Station exits in English: "B4口" → "Exit B4", "7番出口" → "Exit 7".
 * Descriptive names (e.g. "明治通り側出入口") are returned unchanged.
 */
export function translateExit(exit: string): string {
  const match = /^([A-Z]?\d+[a-z]?)番?(?:出入?)?口$/i.exec(normalize(exit))
  return match ? `Exit ${match[1].toUpperCase()}` : exit
}
