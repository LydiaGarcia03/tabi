// Countries a trip can go to, with the currency used there (ISO 3166 → ISO 4217), and their time zone for
// route suggestions. Names come from Chrome itself (Intl.DisplayNames), so this table stays small. Offline, no API.

/** The currency paid in each country. */
export const COUNTRY_CURRENCY: Record<string, string> = {
  AD: 'EUR', AE: 'AED', AF: 'AFN', AG: 'XCD', AL: 'ALL', AM: 'AMD', AO: 'AOA', AR: 'ARS', AT: 'EUR', AU: 'AUD',
  AW: 'AWG', AZ: 'AZN', BA: 'BAM', BB: 'BBD', BD: 'BDT', BE: 'EUR', BF: 'XOF', BG: 'EUR', BH: 'BHD', BI: 'BIF',
  BJ: 'XOF', BM: 'BMD', BN: 'BND', BO: 'BOB', BR: 'BRL', BS: 'BSD', BT: 'BTN', BW: 'BWP', BY: 'BYN', BZ: 'BZD',
  CA: 'CAD', CD: 'CDF', CF: 'XAF', CG: 'XAF', CH: 'CHF', CI: 'XOF', CL: 'CLP', CM: 'XAF', CN: 'CNY', CO: 'COP',
  CR: 'CRC', CU: 'CUP', CV: 'CVE', CW: 'ANG', CY: 'EUR', CZ: 'CZK', DE: 'EUR', DJ: 'DJF', DK: 'DKK', DM: 'XCD',
  DO: 'DOP', DZ: 'DZD', EC: 'USD', EE: 'EUR', EG: 'EGP', ER: 'ERN', ES: 'EUR', ET: 'ETB', FI: 'EUR', FJ: 'FJD',
  FM: 'USD', FR: 'EUR', GA: 'XAF', GB: 'GBP', GD: 'XCD', GE: 'GEL', GH: 'GHS', GM: 'GMD', GN: 'GNF', GQ: 'XAF',
  GR: 'EUR', GT: 'GTQ', GW: 'XOF', GY: 'GYD', HK: 'HKD', HN: 'HNL', HR: 'EUR', HT: 'HTG', HU: 'HUF', ID: 'IDR',
  IE: 'EUR', IL: 'ILS', IN: 'INR', IQ: 'IQD', IR: 'IRR', IS: 'ISK', IT: 'EUR', JM: 'JMD', JO: 'JOD', JP: 'JPY',
  KE: 'KES', KG: 'KGS', KH: 'KHR', KI: 'AUD', KM: 'KMF', KN: 'XCD', KR: 'KRW', KW: 'KWD', KY: 'KYD', KZ: 'KZT',
  LA: 'LAK', LB: 'LBP', LC: 'XCD', LI: 'CHF', LK: 'LKR', LR: 'LRD', LS: 'LSL', LT: 'EUR', LU: 'EUR', LV: 'EUR',
  LY: 'LYD', MA: 'MAD', MC: 'EUR', MD: 'MDL', ME: 'EUR', MG: 'MGA', MH: 'USD', MK: 'MKD', ML: 'XOF', MM: 'MMK',
  MN: 'MNT', MO: 'MOP', MR: 'MRU', MT: 'EUR', MU: 'MUR', MV: 'MVR', MW: 'MWK', MX: 'MXN', MY: 'MYR', MZ: 'MZN',
  NA: 'NAD', NE: 'XOF', NG: 'NGN', NI: 'NIO', NL: 'EUR', NO: 'NOK', NP: 'NPR', NR: 'AUD', NZ: 'NZD', OM: 'OMR',
  PA: 'PAB', PE: 'PEN', PF: 'XPF', PG: 'PGK', PH: 'PHP', PK: 'PKR', PL: 'PLN', PR: 'USD', PS: 'ILS', PT: 'EUR',
  PW: 'USD', PY: 'PYG', QA: 'QAR', RO: 'RON', RS: 'RSD', RU: 'RUB', RW: 'RWF', SA: 'SAR', SB: 'SBD', SC: 'SCR',
  SD: 'SDG', SE: 'SEK', SG: 'SGD', SI: 'EUR', SK: 'EUR', SL: 'SLE', SM: 'EUR', SN: 'XOF', SO: 'SOS', SR: 'SRD',
  SS: 'SSP', ST: 'STN', SV: 'USD', SY: 'SYP', SZ: 'SZL', TD: 'XAF', TG: 'XOF', TH: 'THB', TJ: 'TJS', TL: 'USD',
  TM: 'TMT', TN: 'TND', TO: 'TOP', TR: 'TRY', TT: 'TTD', TV: 'AUD', TW: 'TWD', TZ: 'TZS', UA: 'UAH', UG: 'UGX',
  US: 'USD', UY: 'UYU', UZ: 'UZS', VA: 'EUR', VC: 'XCD', VE: 'VES', VN: 'VND', VU: 'VUV', WS: 'WST', YE: 'YER',
  ZA: 'ZAR', ZM: 'ZMW', ZW: 'ZWG',
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
const currencyNames = new Intl.DisplayNames(['en'], { type: 'currency' })

/** "Japan" */
export function countryName(code: string): string {
  return regionNames.of(code) ?? code
}

/** "Japanese yen" */
export function currencyName(code: string): string {
  const name = currencyNames.of(code) ?? code
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Every country, by English name. */
export const COUNTRIES = Object.keys(COUNTRY_CURRENCY)
  .map((code) => ({ code, name: countryName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name))

/** Every currency of the table, by code (for "My money" and "+ Add a currency"). */
export const CURRENCIES = [...new Set(Object.values(COUNTRY_CURRENCY))].sort()

/** A country spanning several time zones: its rough box (south, west, north, east) and its zones west to east, each with the longitude where it starts. */
interface ZoneBands {
  box: [number, number, number, number]
  bands: [number, string][]
}

/**
 * Time zones for route suggestions ("leave at 09:00" means 09:00 there). One per country, or bands for countries
 * spanning several (used only for points inside their box). Others fall back to the longitude.
 */
const COUNTRY_ZONES: Record<string, string | ZoneBands> = {
  JP: 'Asia/Tokyo', KR: 'Asia/Seoul', CN: 'Asia/Shanghai', TW: 'Asia/Taipei', HK: 'Asia/Hong_Kong', MO: 'Asia/Macau',
  TH: 'Asia/Bangkok', VN: 'Asia/Ho_Chi_Minh', KH: 'Asia/Phnom_Penh', SG: 'Asia/Singapore', MY: 'Asia/Kuala_Lumpur',
  PH: 'Asia/Manila', IN: 'Asia/Kolkata', NP: 'Asia/Kathmandu', LK: 'Asia/Colombo', AE: 'Asia/Dubai', QA: 'Asia/Qatar',
  SA: 'Asia/Riyadh', IL: 'Asia/Jerusalem', JO: 'Asia/Amman', TR: 'Europe/Istanbul', GB: 'Europe/London',
  IE: 'Europe/Dublin', PT: 'Europe/Lisbon', ES: 'Europe/Madrid', FR: 'Europe/Paris', IT: 'Europe/Rome',
  DE: 'Europe/Berlin', NL: 'Europe/Amsterdam', BE: 'Europe/Brussels', LU: 'Europe/Luxembourg', CH: 'Europe/Zurich',
  AT: 'Europe/Vienna', CZ: 'Europe/Prague', SK: 'Europe/Bratislava', PL: 'Europe/Warsaw', HU: 'Europe/Budapest',
  HR: 'Europe/Zagreb', SI: 'Europe/Ljubljana', GR: 'Europe/Athens', DK: 'Europe/Copenhagen', SE: 'Europe/Stockholm',
  NO: 'Europe/Oslo', FI: 'Europe/Helsinki', IS: 'Atlantic/Reykjavik', EE: 'Europe/Tallinn', LV: 'Europe/Riga',
  LT: 'Europe/Vilnius', RO: 'Europe/Bucharest', BG: 'Europe/Sofia', MT: 'Europe/Malta', CY: 'Asia/Nicosia',
  EG: 'Africa/Cairo', MA: 'Africa/Casablanca', ZA: 'Africa/Johannesburg', KE: 'Africa/Nairobi', NZ: 'Pacific/Auckland',
  AR: 'America/Argentina/Buenos_Aires', CL: 'America/Santiago', UY: 'America/Montevideo', PY: 'America/Asuncion',
  PE: 'America/Lima', CO: 'America/Bogota', EC: 'America/Guayaquil', BO: 'America/La_Paz', VE: 'America/Caracas',
  PA: 'America/Panama', CR: 'America/Costa_Rica', CU: 'America/Havana', DO: 'America/Santo_Domingo',
  PR: 'America/Puerto_Rico',
  US: {
    box: [18, -180, 72, -66],
    bands: [[-180, 'Pacific/Honolulu'], [-130, 'America/Los_Angeles'], [-114, 'America/Denver'], [-101, 'America/Chicago'], [-87, 'America/New_York']],
  },
  CA: {
    box: [41.6, -141, 84, -52],
    bands: [[-141, 'America/Vancouver'], [-120, 'America/Edmonton'], [-102, 'America/Winnipeg'], [-90, 'America/Toronto'], [-64, 'America/Halifax']],
  },
  MX: { box: [14.5, -118.5, 32.8, -86.7], bands: [[-118.5, 'America/Tijuana'], [-109, 'America/Mazatlan'], [-105, 'America/Mexico_City'], [-88, 'America/Cancun']] },
  BR: { box: [-34, -74, 5.3, -34.7], bands: [[-74, 'America/Rio_Branco'], [-67, 'America/Manaus'], [-57.5, 'America/Sao_Paulo']] },
  AU: { box: [-44, 112, -10, 154], bands: [[112, 'Australia/Perth'], [129, 'Australia/Darwin'], [138, 'Australia/Brisbane'], [141, 'Australia/Sydney']] },
  RU: {
    box: [41, 19, 82, 180],
    bands: [[19, 'Europe/Kaliningrad'], [27, 'Europe/Moscow'], [60, 'Asia/Yekaterinburg'], [82, 'Asia/Krasnoyarsk'], [100, 'Asia/Irkutsk'], [127, 'Asia/Vladivostok']],
  },
  ID: { box: [-11, 95, 6, 141], bands: [[95, 'Asia/Jakarta'], [115, 'Asia/Makassar'], [129, 'Asia/Jayapura']] },
}

/** Minutes east of UTC that `zone` is at on `date` (summer time included). */
function zoneOffset(zone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(date)
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const match = name.match(/GMT([+-])(\d{2}):?(\d{2})?/)
  return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 0
}

/**
 * UTC offset ("+09:00") at a point on a day, using the trip's countries: of their zones, the one closest to what
 * the longitude suggests (Japan + USA: Los Angeles in California, Tokyo in Japan). Without countries, the longitude.
 */
export function utcOffsetAt(point: { lat: number; lng: number }, date: string, countries: string[] = []): string {
  const day = new Date(`${date}T12:00:00Z`)
  const zones = countries.flatMap((c) => {
    const z = COUNTRY_ZONES[c]
    if (!z) return []
    if (typeof z === 'string') return [z]
    const [south, west, north, east] = z.box
    if (point.lat < south || point.lat > north || point.lng < west || point.lng > east) return []
    return [[...z.bands].reverse().find(([from]) => point.lng >= from)?.[1] ?? z.bands[0][1]]
  })
  const guess = Math.round(point.lng / 15) * 60
  const minutes = zones.length
    ? zones.map((z) => zoneOffset(z, day)).reduce((best, m) => (Math.abs(m - guess) < Math.abs(best - guess) ? m : best))
    : guess
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

/**
 * Roughly Japan, from Hokkaido to Okinawa, in latitude bands that leave out Korea, Vladivostok, Shanghai and
 * Taiwan: where NAVITIME gives transit routes (Google has none there); elsewhere Google does.
 */
export function inJapan({ lat, lng }: { lat: number; lng: number }): boolean {
  if (lat > 46 || lat < 24) return false
  if (lat > 41.3) return lng >= 139.3 && lng <= 146 // Hokkaido
  if (lat > 34.6) return lng >= 129.6 && lng <= 142.5 // Honshu (Korea's east coast is west of it)
  if (lat > 27.9) return lng >= 128.5 && lng <= 142.5 // Kyushu, Shikoku, Izu islands
  return (lng >= 122.9 && lng <= 131.5) || (lng >= 141 && lng <= 142.5) // Okinawa, Ogasawara
}
