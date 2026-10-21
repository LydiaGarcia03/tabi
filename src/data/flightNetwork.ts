// Where the guide's airlines fly, for the flight planner: the airports
// (with coordinates, to estimate flight times) and each airline's nonstop
// routes between Brazil, its hub and Japan. Researched by hand from route
// news and the airlines' pages — no free flight API exists (Amadeus
// Self-Service closed in July 2026, Google's QPX in 2018) and scraping is not
// allowed. Routes change: plans built from this must be checked on Google
// Flights before buying.

export const FLIGHT_NETWORK_UPDATED = '2026-10-21'

export interface Airport {
  code: string
  city: string
  country: 'BR' | 'JP' | 'other'
  lat: number
  lng: number
}

export const AIRPORTS: Airport[] = [
  // Brazil
  { code: 'NVT', city: 'Navegantes', country: 'BR', lat: -26.88, lng: -48.65 },
  { code: 'FLN', city: 'Florianópolis', country: 'BR', lat: -27.67, lng: -48.55 },
  { code: 'JOI', city: 'Joinville', country: 'BR', lat: -26.22, lng: -48.8 },
  { code: 'CWB', city: 'Curitiba', country: 'BR', lat: -25.53, lng: -49.18 },
  { code: 'POA', city: 'Porto Alegre', country: 'BR', lat: -29.99, lng: -51.17 },
  { code: 'GRU', city: 'São Paulo', country: 'BR', lat: -23.43, lng: -46.47 },
  { code: 'CGH', city: 'São Paulo', country: 'BR', lat: -23.63, lng: -46.66 },
  { code: 'VCP', city: 'Campinas', country: 'BR', lat: -23.01, lng: -47.13 },
  { code: 'GIG', city: 'Rio de Janeiro', country: 'BR', lat: -22.81, lng: -43.25 },
  { code: 'SDU', city: 'Rio de Janeiro', country: 'BR', lat: -22.91, lng: -43.16 },
  { code: 'BSB', city: 'Brasília', country: 'BR', lat: -15.87, lng: -47.92 },
  { code: 'CNF', city: 'Belo Horizonte', country: 'BR', lat: -19.62, lng: -43.97 },
  { code: 'SSA', city: 'Salvador', country: 'BR', lat: -12.91, lng: -38.33 },
  { code: 'REC', city: 'Recife', country: 'BR', lat: -8.13, lng: -34.92 },
  { code: 'FOR', city: 'Fortaleza', country: 'BR', lat: -3.78, lng: -38.53 },
  // Connection hubs
  { code: 'DXB', city: 'Dubai', country: 'other', lat: 25.25, lng: 55.36 },
  { code: 'DOH', city: 'Doha', country: 'other', lat: 25.27, lng: 51.61 },
  { code: 'IST', city: 'Istanbul', country: 'other', lat: 41.26, lng: 28.74 },
  { code: 'ADD', city: 'Addis Ababa', country: 'other', lat: 8.98, lng: 38.8 },
  { code: 'CDG', city: 'Paris', country: 'other', lat: 49.01, lng: 2.55 },
  { code: 'AMS', city: 'Amsterdam', country: 'other', lat: 52.31, lng: 4.76 },
  { code: 'FRA', city: 'Frankfurt', country: 'other', lat: 50.03, lng: 8.57 },
  { code: 'MUC', city: 'Munich', country: 'other', lat: 48.35, lng: 11.79 },
  // Japan
  { code: 'NRT', city: 'Tokyo', country: 'JP', lat: 35.77, lng: 140.39 },
  { code: 'HND', city: 'Tokyo', country: 'JP', lat: 35.55, lng: 139.78 },
  { code: 'KIX', city: 'Osaka', country: 'JP', lat: 34.43, lng: 135.24 },
  { code: 'ITM', city: 'Osaka', country: 'JP', lat: 34.79, lng: 135.44 },
  { code: 'NGO', city: 'Nagoya', country: 'JP', lat: 34.86, lng: 136.81 },
  { code: 'FUK', city: 'Fukuoka', country: 'JP', lat: 33.59, lng: 130.45 },
  { code: 'OKA', city: 'Okinawa', country: 'JP', lat: 26.2, lng: 127.65 },
  { code: 'CTS', city: 'Sapporo', country: 'JP', lat: 42.78, lng: 141.69 },
]

/** Long-haul airlines: nonstop routes (flown both ways). Names match the airline guide. */
export const LONG_HAUL_ROUTES: Record<string, [string, string][]> = {
  Emirates: [['GRU', 'DXB'], ['GIG', 'DXB'], ['DXB', 'NRT'], ['DXB', 'HND'], ['DXB', 'KIX']],
  'Qatar Airways': [['GRU', 'DOH'], ['DOH', 'NRT'], ['DOH', 'HND'], ['DOH', 'KIX']],
  'Turkish Airlines': [['GRU', 'IST'], ['IST', 'NRT'], ['IST', 'HND'], ['IST', 'KIX']],
  'Ethiopian Airlines': [['GRU', 'ADD'], ['GIG', 'ADD'], ['ADD', 'NRT']],
  'Air France': [['GRU', 'CDG'], ['GIG', 'CDG'], ['FOR', 'CDG'], ['SSA', 'CDG'], ['CDG', 'HND'], ['CDG', 'KIX']],
  KLM: [['GRU', 'AMS'], ['GIG', 'AMS'], ['AMS', 'NRT'], ['AMS', 'KIX']],
  // Osaka is flown from Munich only.
  Lufthansa: [['GRU', 'FRA'], ['GRU', 'MUC'], ['GIG', 'FRA'], ['FRA', 'HND'], ['MUC', 'HND'], ['MUC', 'KIX']],
}

/** Brazilian airlines: from other Brazilian airports to these hubs (typical; not every city has every airline). */
export const BRAZIL_FEEDER_HUBS: Record<string, string[]> = {
  LATAM: ['GRU', 'GIG', 'BSB'],
  GOL: ['GRU', 'GIG', 'BSB'],
  Azul: ['VCP', 'CNF', 'REC'],
}

export const FLIGHT_NETWORK_SOURCES = [
  'https://www.aeroroutes.com/eng/251211-qr2q26kix',
  'https://www.aeroroutes.com/eng/260707-klsep26kix',
  'https://www.lufthansa.com/jp/en/local-page/schedule-for-japan-routes',
  'https://passageirodeprimeira.com/companhias-europeias-ampliam-voos-entre-brasil-e-europa-para-2026/',
  'https://www.emirates.com/english/destinations/gig/nrt/flights-from-rio-de-janeiro-to-tokyo-narita/',
]

const byCode = new Map(AIRPORTS.map((a) => [a.code, a]))

export function airport(code: string): Airport | undefined {
  return byCode.get(code.toUpperCase())
}

/** "Osaka (KIX)" */
export function airportLabel(code: string): string {
  const a = airport(code)
  return a ? `${a.city} (${a.code})` : code
}

/**
 * Airports meant by a text: an IATA code in it ("Navegantes (NVT)", "kix"),
 * else every airport of a city ("Osaka" → KIX, ITM).
 */
export function airportsFor(text: string): string[] {
  const t = text.trim()
  if (!t) return []
  const code = /\b([A-Za-z]{3})\b/.exec(t.match(/\(([A-Za-z]{3})\)/)?.[1] ?? (t.length === 3 ? t : ''))?.[1]
  if (code && airport(code)) return [code.toUpperCase()]
  const city = t.toLowerCase()
  return AIRPORTS.filter((a) => a.city.toLowerCase() === city || city.includes(a.city.toLowerCase())).map((a) => a.code)
}

/** Great-circle distance in km. */
export function airportDistanceKm(a: string, b: string): number | undefined {
  const p = airport(a)
  const q = airport(b)
  if (!p || !q) return undefined
  const rad = Math.PI / 180
  const dLat = (q.lat - p.lat) * rad
  const dLng = (q.lng - p.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p.lat * rad) * Math.cos(q.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}
