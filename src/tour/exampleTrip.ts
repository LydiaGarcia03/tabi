// The example trip the tour shows the app with ("Japan in spring"): public places only, typed here (no API request).
// It is an ordinary trip once saved: the user can explore it, change it or delete it.

import { addDays, dateRange, today } from '../dates'
import { db } from '../db/db'
import type { Day, Expense, Leg, OpeningHours, Place, Segment, Stay, StayBase, Trip, TripOption } from '../db/model'
import type { TripData } from '../db/tripData'
import { deleteTrip } from '../db/trips'
import { importBackup } from '../export/backup'
import type { LatLng, Money } from '../routing/types'

const KEY = 'tabi.exampleTrip'

/** The saved example trip and the day the tour opens. */
export interface ExampleTrip {
  tripId: string
  dayId: string
}

const id = () => crypto.randomUUID()
const yen = (amount: number): Money => ({ amount, currency: 'JPY' })
const everyDay = (open: string, close: string): OpeningHours => ({ days: Array.from({ length: 7 }, () => [{ open, close }]) })

/** Rough rates for "my money" (1 JPY = …), only so the budget isn't empty; the user can update them in Trip settings. */
const JPY_RATE: Record<string, number> = { BRL: 0.036, USD: 0.0067, EUR: 0.0062, GBP: 0.0053 }

const P = {
  shibuya: { lat: 35.6595, lng: 139.70055 },
  shibuyaSky: { lat: 35.6584, lng: 139.70225 },
  sensoji: { lat: 35.71477, lng: 139.79665 },
  asakusaSta: { lat: 35.71098, lng: 139.79778 },
  tawaramachi: { lat: 35.71062, lng: 139.79002 },
  inaricho: { lat: 35.71107, lng: 139.78418 },
  uenoSta: { lat: 35.7113, lng: 139.77727 },
  uenoPark: { lat: 35.7148, lng: 139.7734 },
  museum: { lat: 35.71885, lng: 139.7765 },
  meiji: { lat: 35.6764, lng: 139.6993 },
  harajuku: { lat: 35.67022, lng: 139.70268 },
  yoyogi: { lat: 35.68306, lng: 139.70204 },
  shinjukuSta: { lat: 35.69014, lng: 139.70043 },
  omoide: { lat: 35.693, lng: 139.6994 },
  kiyomizu: { lat: 34.9949, lng: 135.785 },
  hanamikoji: { lat: 35.0023, lng: 135.7752 },
  inari: { lat: 34.96714, lng: 135.77267 },
  kinkakuji: { lat: 35.03937, lng: 135.72924 },
  todaiji: { lat: 34.68895, lng: 135.8398 },
  naraPark: { lat: 34.6851, lng: 135.843 },
  hotelTokyo: { lat: 35.7124, lng: 139.7762 },
  hotelKyoto: { lat: 34.986, lng: 135.759 },
} satisfies Record<string, LatLng>

/** The first spring (April) at least two months away, so the trip is still being planned. */
function springStart(now: string): string {
  const [year, month] = now.split('-').map(Number)
  return `${month >= 2 ? year + 1 : year}-04-04`
}

export function buildExampleTrip(displayCurrency: string): { data: TripData; dayId: string } {
  const start = springStart(today())
  const end = addDays(start, 6)
  const date = (n: number) => addDays(start, n)
  const at = (n: number, time: string) => `${date(n)}T${time}:00+09:00`
  const now = new Date().toISOString()
  const tripId = id()
  const rate = displayCurrency === 'JPY' ? 0 : JPY_RATE[displayCurrency] ?? 0

  const trip: Trip = {
    id: tripId,
    name: 'Japan in spring - Example',
    startDate: start,
    endDate: end,
    baseCurrency: 'JPY',
    displayCurrency,
    exchangeRate: rate,
    countries: ['JP'],
    currencies: displayCurrency === 'JPY' ? [] : [{ code: 'JPY', rate }],
    travelers: 2,
    createdAt: now,
    updatedAt: now,
    notes: 'An example trip to see how a planned trip looks. Change anything, or delete it in Trip settings.',
    estimates: [
      { id: id(), label: 'Souvenirs', category: 'shopping', amount: yen(30000) },
      { id: id(), label: 'Suica top-ups', category: 'transport', amount: yen(8000) },
    ],
    checklist: [{ id: id(), text: 'Buy travel insurance', done: false, due: addDays(start, -30) }],
  }

  const days: Day[] = dateRange(start, end).map((d) => ({ id: id(), tripId, date: d, title: '', placeIds: [] }))
  const places: Place[] = []
  const legs: Leg[] = []

  function place(day: number, name: string, point: LatLng, extra: Partial<Place> = {}): Place {
    const p: Place = { id: id(), tripId, dayId: days[day].id, name, lat: point.lat, lng: point.lng, notes: '', visitMinutes: 60, ...extra }
    places.push(p)
    days[day].placeIds.push(p.id)
    return p
  }
  function leg(from: Place, to: Place, segments: Omit<Segment, 'id'>[]) {
    legs.push({ id: id(), tripId, fromPlaceId: from.id, toPlaceId: to.id, segments: segments.map((s) => ({ ...s, id: id() })), source: 'manual' })
  }
  function walk(path: LatLng[], minutes: number, meters: number, depart?: string, arrive?: string): Omit<Segment, 'id'> {
    return { mode: 'walk', path, durationMinutes: minutes, distanceMeters: meters, departureTime: depart, arrivalTime: arrive }
  }

  // Day 1 · Tokyo: arrival, Shibuya at night.
  days[0].title = 'Arrival and Shibuya'
  const crossing = place(0, 'Shibuya Scramble Crossing', P.shibuya, {
    plannedTime: '18:00',
    visitMinutes: 30,
    notes: 'Best seen from above: the Starbucks in Tsutaya or the station’s walkway.',
  })
  const sky = place(0, 'Shibuya Sky', P.shibuyaSky, {
    plannedTime: '18:45',
    visitMinutes: 75,
    cost: yen(2500),
    bookAhead: 'ticket',
    openingHours: everyDay('10:00', '22:30'),
    notes: 'Book the sunset slot early: it sells out.',
  })
  leg(crossing, sky, [walk([P.shibuya, { lat: 35.659, lng: 139.7015 }, P.shibuyaSky], 5, 300)])

  // Day 2 · Tokyo: Asakusa and Ueno (the day the tour opens).
  days[1].title = 'Asakusa and Ueno'
  const sensoji = place(1, 'Senso-ji', P.sensoji, {
    plannedTime: '09:00',
    visitMinutes: 60,
    openingHours: everyDay('06:00', '17:00'),
    notes: 'Tokyo’s oldest temple (628). Walk in through Kaminarimon and the Nakamise shopping street.',
  })
  const park = place(1, 'Ueno Park', P.uenoPark, {
    plannedTime: '10:30',
    visitMinutes: 75,
    notes: 'Cherry blossoms along the main path in early April.',
  })
  const museum = place(1, 'Tokyo National Museum', P.museum, {
    plannedTime: '12:00',
    visitMinutes: 120,
    cost: yen(1000),
    bookAhead: 'ticket',
    notes: 'Japan’s oldest museum. Open 09:30–17:00, closed on Mondays.',
  })
  leg(sensoji, park, [
    walk([P.sensoji, { lat: 35.7125, lng: 139.7966 }, P.asakusaSta], 6, 450, at(1, '10:02'), at(1, '10:08')),
    {
      mode: 'subway',
      lineName: 'Ginza Line',
      operator: 'Tokyo Metro',
      fromName: 'Asakusa',
      toName: 'Ueno',
      fromCode: 'G19',
      toCode: 'G16',
      fromCoord: P.asakusaSta,
      toCoord: P.uenoSta,
      service: 'Local',
      headsign: 'for Shibuya',
      intermediateStops: [
        { name: 'Tawaramachi', original: '田原町', time: at(1, '10:12'), coord: P.tawaramachi },
        { name: 'Inaricho', original: '稲荷町', time: at(1, '10:13'), coord: P.inaricho },
      ],
      departureTime: at(1, '10:10'),
      arrivalTime: at(1, '10:15'),
      durationMinutes: 5,
      fare: yen(180),
      color: '#f39700',
      path: [P.asakusaSta, P.tawaramachi, P.inaricho, P.uenoSta],
      originalNames: { line: '東京メトロ銀座線', operator: '東京メトロ', from: '浅草', to: '上野' },
    },
    walk([P.uenoSta, { lat: 35.7128, lng: 139.7745 }, P.uenoPark], 8, 550, at(1, '10:17'), at(1, '10:25')),
  ])
  leg(park, museum, [walk([P.uenoPark, { lat: 35.7168, lng: 139.7742 }, P.museum], 9, 650)])

  // Day 3 · Tokyo: Meiji Jingu and Shinjuku.
  days[2].title = 'Meiji Jingu and Shinjuku'
  const meiji = place(2, 'Meiji Jingu', P.meiji, { plannedTime: '09:30', visitMinutes: 75, openingHours: everyDay('06:00', '17:00') })
  const omoide = place(2, 'Omoide Yokocho', P.omoide, {
    kind: 'restaurant',
    plannedTime: '12:00',
    visitMinutes: 60,
    cost: yen(2000),
    notes: 'Tiny yakitori bars under the tracks. Cash only in most of them.',
  })
  leg(meiji, omoide, [
    walk([P.meiji, { lat: 35.6725, lng: 139.7012 }, P.harajuku], 10, 750, at(2, '11:10'), at(2, '11:20')),
    {
      mode: 'train',
      lineName: 'Yamanote Line',
      operator: 'JR East',
      fromName: 'Harajuku',
      toName: 'Shinjuku',
      fromCode: 'JY19',
      toCode: 'JY17',
      fromCoord: P.harajuku,
      toCoord: P.shinjukuSta,
      service: 'Local',
      headsign: 'for Shinjuku, Ikebukuro',
      intermediateStops: [{ name: 'Yoyogi', original: '代々木', time: at(2, '11:25'), coord: P.yoyogi }],
      departureTime: at(2, '11:23'),
      arrivalTime: at(2, '11:27'),
      durationMinutes: 4,
      fare: yen(160),
      color: '#80c241',
      path: [P.harajuku, P.yoyogi, P.shinjukuSta],
      originalNames: { line: 'ＪＲ山手線', operator: 'ＪＲ東日本', from: '原宿', to: '新宿' },
    },
    walk([P.shinjukuSta, P.omoide], 5, 400, at(2, '11:29'), at(2, '11:34')),
  ])

  // Day 4 · Tokyo → Kyoto by shinkansen.
  days[3].title = 'To Kyoto'
  const kiyomizu = place(3, 'Kiyomizu-dera', P.kiyomizu, {
    plannedTime: '15:00',
    visitMinutes: 90,
    cost: yen(500),
    openingHours: everyDay('06:00', '18:00'),
    notes: 'The wooden stage over the hill. Come down through Sannenzaka and Ninenzaka.',
  })
  const gion = place(3, 'Hanamikoji Street', P.hanamikoji, { plannedTime: '17:30', visitMinutes: 60, notes: 'Gion’s main street. Don’t take photos of geiko without asking.' })
  leg(kiyomizu, gion, [walk([P.kiyomizu, { lat: 34.9985, lng: 135.7808 }, { lat: 35.0012, lng: 135.7765 }, P.hanamikoji], 22, 1600)])

  // Day 5 · Kyoto.
  days[4].title = 'Fushimi Inari and Kinkaku-ji'
  place(4, 'Fushimi Inari Taisha', P.inari, { plannedTime: '07:30', visitMinutes: 120, notes: 'Go early: the gates are quiet before 8. The full walk to the top takes 2–3 h.' })
  place(4, 'Kinkaku-ji', P.kinkakuji, { plannedTime: '13:00', visitMinutes: 60, cost: yen(500), openingHours: everyDay('09:00', '17:00') })

  // Day 6 · Nara, a day trip from Kyoto.
  days[5].title = 'Nara'
  const todaiji = place(5, 'Todai-ji', P.todaiji, { plannedTime: '10:00', visitMinutes: 75, cost: yen(800), openingHours: everyDay('07:30', '17:30') })
  const nara = place(5, 'Nara Park', P.naraPark, { plannedTime: '11:30', visitMinutes: 90, notes: 'The deer bow for shika senbei (crackers, ¥200).' })
  leg(todaiji, nara, [walk([P.todaiji, { lat: 34.6868, lng: 135.8412 }, P.naraPark], 7, 500)])

  // Day 7 · Kyoto: free morning, going home.
  days[6].title = 'Free morning'

  // Hotels: options in each city, the Tokyo one in the itinerary and booked.
  const hotelTokyo: StayBase = { name: 'Hotel near Ueno Station', ...P.hotelTokyo, kind: 'hotel' }
  const hotelKyoto: StayBase = { name: 'Hotel near Kyoto Station', ...P.hotelKyoto, kind: 'hotel' }
  const tokyoExpense: Expense = {
    id: id(),
    tripId,
    category: 'lodging',
    description: hotelTokyo.name,
    amount: yen(54000),
    hotel: { name: hotelTokyo.name, checkIn: date(0), checkOut: date(3), nights: 3, perNight: 18000 },
    booked: true,
  }
  const kyotoExpense: Expense = {
    id: id(),
    tripId,
    category: 'lodging',
    description: hotelKyoto.name,
    amount: yen(45000),
    hotel: { name: hotelKyoto.name, checkIn: date(3), checkOut: date(6), nights: 3, perNight: 15000 },
  }
  const shinkansen: Expense = {
    id: id(),
    tripId,
    category: 'transport',
    description: 'Tokyo → Kyoto',
    amount: yen(29000),
    journey: { mode: 'shinkansen', from: 'Tokyo', to: 'Kyoto', date: date(3), time: '11:00', carrier: 'JR Central', number: 'Nozomi', durationHours: 2.25, bookingNeeded: true },
  }

  const option = (o: Omit<TripOption, 'id' | 'tripId' | 'createdAt'>): TripOption => ({ id: id(), tripId, createdAt: now, ...o })
  const tokyoOption = option({ kind: 'hotel', status: 'chosen', name: hotelTokyo.name, city: 'Tokyo', price: yen(18000), rating: 4, category: 'Business hotel', ...P.hotelTokyo, expenseId: tokyoExpense.id, notes: 'Two minutes from Ueno Station: the Keisei line goes straight to Narita.' })
  const kyotoOption = option({ kind: 'hotel', status: 'chosen', name: hotelKyoto.name, city: 'Kyoto', price: yen(15000), rating: 4, category: 'Business hotel', ...P.hotelKyoto, expenseId: kyotoExpense.id })
  hotelTokyo.optionId = tokyoOption.id
  hotelKyoto.optionId = kyotoOption.id
  const options: TripOption[] = [
    tokyoOption,
    option({ kind: 'hotel', status: 'idea', name: 'Ryokan in Asakusa', city: 'Tokyo', price: yen(26000), rating: 5, category: 'Ryokan', lat: 35.7158, lng: 139.7935, notes: 'Tatami rooms and a shared bath. Pricier, but an experience.' }),
    option({ kind: 'hotel', status: 'idea', name: 'Capsule hotel in Shinjuku', city: 'Tokyo', price: yen(6000), rating: 3, category: 'Capsule', lat: 35.6938, lng: 139.7034 }),
    kyotoOption,
    option({ kind: 'hotel', status: 'favorite', name: 'Machiya in Gion', city: 'Kyoto', price: yen(24000), rating: 5, category: 'Townhouse', lat: 35.0035, lng: 135.7745 }),
    option({ kind: 'restaurant', status: 'chosen', name: 'Omoide Yokocho', city: 'Tokyo', price: yen(2000), rating: 4, category: 'Yakitori', ...P.omoide, placeId: omoide.id }),
    option({ kind: 'restaurant', status: 'idea', name: 'Nishiki Market', city: 'Kyoto', price: yen(1500), rating: 4, category: 'Street food', lat: 35.005, lng: 135.7649, openingHours: everyDay('09:00', '18:00') }),
    option({ kind: 'place', status: 'favorite', name: 'Philosopher’s Path', city: 'Kyoto', rating: 5, category: 'Walk', lat: 35.0236, lng: 135.7944, notes: 'Lined with cherry trees: lovely in early April.' }),
    option({ kind: 'transport', status: 'chosen', name: 'Nozomi Tokyo → Kyoto', price: yen(14500), journey: shinkansen.journey, expenseId: shinkansen.id }),
  ]

  const stays: Stay[] = [
    { id: id(), tripId, city: 'Tokyo', startDate: date(0), endDate: date(3), base: hotelTokyo },
    { id: id(), tripId, city: 'Kyoto', startDate: date(3), endDate: date(6), base: hotelKyoto },
    { id: id(), tripId, city: 'Nara', startDate: date(5), endDate: date(5), kind: 'day-trip' },
  ]

  return {
    data: { trip, days, places, legs, expenses: [tokyoExpense, kyotoExpense, shinkansen], stays, options, photos: [] },
    dayId: days[1].id,
  }
}

function saved(): ExampleTrip | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as ExampleTrip | null
    return value?.tripId && value.dayId ? value : null
  } catch {
    return null
  }
}

/** The example trip, created now if it isn't on the device (never created twice). */
export async function ensureExampleTrip(): Promise<ExampleTrip> {
  const known = saved()
  if (known && (await db.trips.get(known.tripId)) && (await db.days.get(known.dayId))) return known
  // "My money" as on the last trip made (BRL at first), like a new trip.
  const last = (await db.trips.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1)
  const { data, dayId } = buildExampleTrip(last?.displayCurrency ?? 'BRL')
  const tripId = await importBackup(data, 'replace')
  const example = { tripId, dayId }
  try {
    localStorage.setItem(KEY, JSON.stringify(example))
  } catch {
    // Not remembered: a replayed tour makes another one.
  }
  return example
}

export async function deleteExampleTrip(): Promise<void> {
  const known = saved()
  if (known) await deleteTrip(known.tripId)
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to forget.
  }
}
