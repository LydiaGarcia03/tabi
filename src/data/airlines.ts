// Airline guide: baggage (personal item, carry-on, checked by fare), premium
// economy and legroom, for airlines flying Brazil → Japan (with a connection)
// and inside Japan. Researched by hand from the airlines' own pages — no API
// exists for this and scraping is not allowed. Rules change: every entry says
// what still needs confirming, and links its sources. Update by asking Claude.

export const AIRLINE_GUIDE_UPDATED = '2026-10-20'

export interface BagRule {
  /** Length × width × height, cm. */
  cm?: [number, number, number]
  /** Max length + width + height, cm. */
  linearCm?: number
  kg?: number
  note?: string
}

export interface CheckedRule {
  /** Fare family, e.g. "Saver", "Light", "All fares". */
  fare: string
  /** Number of bags included (0 = none), or a short text when it varies. */
  pieces: number | string
  kgEach?: number
  note?: string
}

export interface AirlineInfo {
  code: string
  name: string
  /** Other ways people write it (matched case-insensitively). */
  aliases: string[]
  scope: 'international' | 'japan-domestic'
  type: 'full-service' | 'low-cost'
  alliance?: string
  hub?: string
  /** null = no separate personal item (it must fit in the carry-on allowance). */
  personalItem: BagRule | null
  carryOn: BagRule
  /** E.g. "12 kg is the total of both items". */
  cabinNote?: string
  checked: CheckedRule[]
  /** Limits per checked bag. */
  checkedMax?: BagRule
  premiumEconomy: 'yes' | 'no' | 'some aircraft'
  /** Seat pitch, as published (varies by aircraft). */
  legroom?: { economy?: string; premiumEconomy?: string }
  notes: string[]
  /** What the sources didn't settle: check before buying. */
  toConfirm: string[]
  sources: string[]
}

export const AIRLINES: AirlineInfo[] = [
  {
    code: 'EK',
    name: 'Emirates',
    aliases: ['emirates'],
    scope: 'international',
    type: 'full-service',
    hub: 'Dubai (DXB)',
    personalItem: null,
    carryOn: { cm: [55, 38, 22], kg: 7, note: '10 kg on trips starting in Brazil with tickets bought in Brazil' },
    cabinNote: 'Economy has one piece only: it can be a handbag or a laptop bag.',
    checked: [
      { fare: 'Economy Special', pieces: 1, kgEach: 23 },
      { fare: 'Economy Saver', pieces: 1, kgEach: 23, note: 'one Emirates table says 2 — confirm' },
      { fare: 'Economy Flex', pieces: 2, kgEach: 23 },
      { fare: 'Economy Flex Plus', pieces: 2, kgEach: 23 },
    ],
    checkedMax: { kg: 23, note: 'Piece concept on flights to/from the Americas' },
    premiumEconomy: 'some aircraft',
    legroom: { economy: '32–34 in', premiumEconomy: '~40 in' },
    notes: ['Brazil (Americas) routes use the piece concept: number of bags, 23 kg each.'],
    toConfirm: ['Saver allowance on Americas routes (1 or 2 bags)', 'Whether your flights have Premium Economy (A380/A350 only)'],
    sources: [
      'https://www.emirates.com/br/english/before-you-fly/baggage/checked-baggage/',
      'https://www.emirates.com/english/before-you-fly/baggage/cabin-baggage-rules/',
      'https://www.emirates.com/us/english/information/optional-services/',
    ],
  },
  {
    code: 'QR',
    name: 'Qatar Airways',
    aliases: ['qatar'],
    scope: 'international',
    type: 'full-service',
    alliance: 'oneworld',
    hub: 'Doha (DOH)',
    personalItem: null,
    carryOn: { cm: [50, 37, 25], kg: 7, note: '10 kg on flights to/from Brazil' },
    cabinNote: 'No separate personal item size is published (only for US flights).',
    checked: [
      { fare: 'Economy Lite', pieces: 1, kgEach: 23 },
      { fare: 'Economy Classic', pieces: 2, kgEach: 23 },
      { fare: 'Economy Convenience', pieces: 2, kgEach: 23 },
      { fare: 'Economy Comfort', pieces: 2, kgEach: 23 },
    ],
    checkedMax: { linearCm: 158, kg: 23, note: 'Piece concept on flights to/from the Americas' },
    premiumEconomy: 'no',
    legroom: { economy: '31–32 in' },
    notes: ['Japan-only routes use a weight concept (20–35 kg total); a Brazil-origin ticket follows the piece rules above.'],
    toConfirm: ['10 kg Brazil carry-on applies to your ticket'],
    sources: ['https://www.qatarairways.com/en/baggage/allowance.html', 'https://www.qatarairways.com/en/optional-services-and-fees.html'],
  },
  {
    code: 'TK',
    name: 'Turkish Airlines',
    aliases: ['turkish', 'thy'],
    scope: 'international',
    type: 'full-service',
    alliance: 'Star Alliance',
    hub: 'Istanbul (IST)',
    personalItem: { cm: [40, 30, 15], kg: 4 },
    carryOn: { cm: [55, 40, 23], kg: 8 },
    checked: [
      { fare: 'EcoFly', pieces: '1–2', kgEach: 23, note: 'confirm for Brazil' },
      { fare: 'ExtraFly / PrimeFly', pieces: 2, kgEach: 23, note: 'confirm' },
    ],
    checkedMax: { linearCm: 158, kg: 23 },
    premiumEconomy: 'no',
    legroom: { economy: '~32 in' },
    notes: ['Flights to/from Brazil use the piece concept; guides say 2 bags for Brazil, but EcoFly may include fewer.'],
    toConfirm: ['Number of bags for your fare from Brazil (an old notice said 32 kg per bag from Brazil)'],
    sources: [
      'https://www.turkishairlines.com/en-gb/any-questions/carry-on-baggage/',
      'https://www.turkishairlines.com/en-int/any-questions/checked-baggage',
    ],
  },
  {
    code: 'ET',
    name: 'Ethiopian Airlines',
    aliases: ['ethiopian'],
    scope: 'international',
    type: 'full-service',
    alliance: 'Star Alliance',
    hub: 'Addis Ababa (ADD)',
    personalItem: null,
    carryOn: { cm: [55, 40, 23], kg: 7 },
    cabinNote: 'The 7 kg includes personal items.',
    checked: [{ fare: 'Economy', pieces: 2, kgEach: 23, note: 'general rule — confirm for Brazil' }],
    checkedMax: { linearCm: 158, kg: 23 },
    premiumEconomy: 'no',
    notes: [],
    toConfirm: ['Number of bags on Brazil–Japan tickets', 'Legroom (not published)'],
    sources: ['https://www.ethiopianairlines.com/bz/information/baggage-information/free-baggage-allowance'],
  },
  {
    code: 'AF',
    name: 'Air France',
    aliases: ['air france'],
    scope: 'international',
    type: 'full-service',
    alliance: 'SkyTeam',
    hub: 'Paris (CDG)',
    personalItem: { cm: [40, 30, 15], note: 'accessory' },
    carryOn: { cm: [55, 35, 25], note: 'not included in some Light/Basic fares' },
    cabinNote: '12 kg is the total of both items.',
    checked: [
      { fare: 'Light', pieces: 0 },
      { fare: 'Standard', pieces: 1, kgEach: 23 },
      { fare: 'Flex', pieces: '1–2', kgEach: 23 },
    ],
    checkedMax: { linearCm: 158, kg: 23 },
    premiumEconomy: 'yes',
    notes: ['Air France says trips whose first flight leaves Brazil, on tickets bought in Brazil, get 2 × 23 kg.'],
    toConfirm: ['Brazil 2-bag rule for your fare', 'Legroom (not found)'],
    sources: ['https://wwws.airfrance.com.br/en/information/bagages/bagage-cabine-soute', 'https://wwws.airfrance.us/information/legal/us-regulation'],
  },
  {
    code: 'KL',
    name: 'KLM',
    aliases: ['klm', 'royal dutch'],
    scope: 'international',
    type: 'full-service',
    alliance: 'SkyTeam',
    hub: 'Amsterdam (AMS)',
    personalItem: { cm: [40, 30, 15], note: 'small bag' },
    carryOn: { cm: [55, 35, 25] },
    cabinNote: '12 kg is the total of both items.',
    checked: [
      { fare: 'Light', pieces: 0 },
      { fare: 'Standard', pieces: 1, kgEach: 23 },
      { fare: 'Flex', pieces: 1, kgEach: 23 },
    ],
    checkedMax: { linearCm: 158, kg: 23 },
    premiumEconomy: 'yes',
    notes: ['Premium cabin is called Premium Comfort.'],
    toConfirm: ['Legroom (not found)'],
    sources: [
      'https://www.klm.com.br/en/information/baggage/checked-baggage-allowance',
      'https://www.klm.com.br/en/information/ticket-services/ticket-options',
    ],
  },
  {
    code: 'LH',
    name: 'Lufthansa',
    aliases: ['lufthansa'],
    scope: 'international',
    type: 'full-service',
    alliance: 'Star Alliance',
    hub: 'Frankfurt (FRA) / Munich (MUC)',
    personalItem: { cm: [40, 30, 15] },
    carryOn: { cm: [55, 40, 23], kg: 8 },
    checked: [
      { fare: 'Economy Light', pieces: 0, note: 'first bag can be bought' },
      { fare: 'Economy Classic / Flex', pieces: 1, kgEach: 23, note: 'confirm for Brazil' },
    ],
    checkedMax: { linearCm: 158, kg: 23 },
    premiumEconomy: 'yes',
    legroom: { premiumEconomy: '38–39 in' },
    notes: [],
    toConfirm: ['Classic/Flex bags on Brazil routes'],
    sources: ['https://www.lufthansa.com/us/en/carry-on-baggage', 'https://www.lufthansa.com/us/en/freigepaeck-regeln'],
  },
  {
    code: 'NH',
    name: 'ANA (All Nippon Airways)',
    aliases: ['ana', 'all nippon'],
    scope: 'international',
    type: 'full-service',
    alliance: 'Star Alliance',
    hub: 'Tokyo (HND/NRT)',
    personalItem: { cm: [40, 30, 20], note: 'must fit under the seat' },
    carryOn: { cm: [55, 40, 25], linearCm: 115 },
    cabinNote: '10 kg is the total of both items.',
    checked: [
      { fare: 'Economy Light', pieces: 1, kgEach: 23, note: 'was 2 — reduced on some routes' },
      { fare: 'Economy (other fares)', pieces: 2, kgEach: 23 },
    ],
    checkedMax: { linearCm: 158, kg: 23 },
    premiumEconomy: 'yes',
    legroom: { economy: '34 in', premiumEconomy: '38 in' },
    notes: ['International flights (e.g. US → Japan connections).'],
    toConfirm: ['Pieces for your fare'],
    sources: [
      'https://www.ana.co.jp/en/jp/guide/boarding-procedures/baggage/international/carry-rule/',
      'https://www.ana.co.jp/en/us/travel-information/baggage-information/checked-baggage/',
    ],
  },
  {
    code: 'JL',
    name: 'JAL (Japan Airlines)',
    aliases: ['jal', 'japan airlines'],
    scope: 'international',
    type: 'full-service',
    alliance: 'oneworld',
    hub: 'Tokyo (HND/NRT)',
    personalItem: { note: 'size not given; must fit under the seat' },
    carryOn: { cm: [55, 40, 25], linearCm: 115 },
    cabinNote: '10 kg is the total of both items.',
    checked: [{ fare: 'Economy', pieces: 2, kgEach: 23 }],
    checkedMax: { linearCm: 203, kg: 23 },
    premiumEconomy: 'yes',
    notes: ['International flights. Very generous bag size (203 cm).'],
    toConfirm: ['Legroom (not found)'],
    sources: ['https://www.jal.co.jp/uk/en/travelinfo/', 'https://www.jal.co.jp/jp/en/inter/baggage/inflight/'],
  },
  {
    code: 'NH',
    name: 'ANA (domestic Japan)',
    aliases: ['ana domestic'],
    scope: 'japan-domestic',
    type: 'full-service',
    alliance: 'Star Alliance',
    personalItem: { cm: [40, 30, 20] },
    carryOn: { cm: [55, 40, 25], linearCm: 115, note: '45 × 35 × 20 cm on planes with fewer than 100 seats' },
    cabinNote: '10 kg is the total of both items.',
    checked: [{ fare: 'Economy (all fares)', pieces: 'included', note: 'free; confirm the weight (20 kg total vs 23 kg per bag)' }],
    checkedMax: { linearCm: 158 },
    premiumEconomy: 'yes',
    notes: ['Premium cabin on domestic flights is "Premium Class".'],
    toConfirm: ['Free checked weight'],
    sources: [
      'https://www.ana.co.jp/en/jp/guide/boarding-procedures/baggage/domestic/free/',
      'https://www.ana.co.jp/en/jp/guide/boarding-procedures/baggage/domestic/carry-rule/',
    ],
  },
  {
    code: 'MM',
    name: 'Peach',
    aliases: ['peach', 'peach aviation'],
    scope: 'japan-domestic',
    type: 'low-cost',
    hub: 'Osaka (KIX)',
    personalItem: { note: 'counts in the 7 kg' },
    carryOn: { cm: [50, 40, 25], linearCm: 115 },
    cabinNote: '7 kg is the total of both items (bag + personal item); weighed at the gate.',
    checked: [
      { fare: 'Minimum', pieces: 0, note: 'can be bought (cheaper online)' },
      { fare: 'Standard', pieces: 1, note: 'confirm weight' },
      { fare: 'Standard Plus', pieces: 1, note: 'confirm weight' },
    ],
    premiumEconomy: 'no',
    notes: ['Low-cost: extras cost more at the airport than online.'],
    toConfirm: ['Weight of the included bag'],
    sources: ['https://www.flypeach.com/en/lm/ai/airports/baggage/carry_on_bag', 'https://www.flypeach.com/en/lm/fares/fare_type'],
  },
  {
    code: 'GK',
    name: 'Jetstar Japan',
    aliases: ['jetstar'],
    scope: 'japan-domestic',
    type: 'low-cost',
    personalItem: { note: 'small item under the seat, counts in the 7 kg' },
    carryOn: { note: 'one main item in the overhead locker; size not found for Jetstar Japan' },
    cabinNote: '7 kg is the total of both items (can be raised to 14 kg for a fee).',
    checked: [
      { fare: 'Starter', pieces: 0, note: 'can be bought' },
      { fare: 'Starter + 20 kg', pieces: '20 kg' },
    ],
    premiumEconomy: 'no',
    notes: ['Some Kansai–Okinawa flights may be operated by Jetstar Airways (JQ), with different rules.'],
    toConfirm: ['Carry-on size'],
    sources: ['https://www.jetstar.com/jp/en/flights/baggage/carry-on-baggage'],
  },
]

/** The airline guide entry for a carrier name, if known ("emirates", "LATAM"…). */
export function findAirline(carrier: string | undefined, scope?: AirlineInfo['scope']): AirlineInfo | undefined {
  const text = carrier?.trim().toLowerCase()
  if (!text) return undefined
  const candidates = scope ? AIRLINES.filter((a) => a.scope === scope) : AIRLINES
  return (
    candidates.find((a) => a.name.toLowerCase() === text || a.code.toLowerCase() === text) ??
    candidates.find((a) => [a.name, ...a.aliases].some((n) => text.includes(n.toLowerCase())))
  )
}

/** The checked-baggage rule for a fare name, when it can be matched. */
export function checkedForFare(airline: AirlineInfo, fare: string | undefined): CheckedRule | undefined {
  const text = fare?.trim().toLowerCase()
  if (!text) return undefined
  return airline.checked.find((r) => r.fare.toLowerCase().includes(text) || text.includes(r.fare.toLowerCase().replace('economy ', '')))
}

/** "55×40×23 cm · 8 kg" */
export function describeBag(bag: BagRule | null): string {
  if (!bag) return 'none (one piece only)'
  const parts = [
    bag.cm ? `${bag.cm.join('×')} cm` : '',
    bag.linearCm ? `≤ ${bag.linearCm} cm total` : '',
    bag.kg ? `${bag.kg} kg` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : (bag.note ?? '—')
}

/** "2 × 23 kg", "none", "1–2 × 23 kg" */
export function describeChecked(rule: CheckedRule): string {
  if (rule.pieces === 0) return 'none'
  if (typeof rule.pieces === 'string' && !rule.kgEach) return rule.pieces
  return `${rule.pieces} × ${rule.kgEach ? `${rule.kgEach} kg` : 'bag'}`
}
