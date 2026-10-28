import { metric } from '../format'

// Airline guide: baggage (personal item, carry-on, checked by fare), premium
// economy and legroom, for airlines flying Brazil → Japan (with a connection),
// inside Brazil (the first flight), inside Japan, and the biggest of the Americas (the four largest US airlines;
// Air Canada, Aeroméxico, Copa, Avianca, Aerolíneas Argentinas; added 2026-10-28, a reference only: User always
// checks the airline herself). Researched by hand from the airlines' own pages — no API
// exists for this and scraping is not allowed. Rules change: every entry says
// what still needs confirming, and links its sources. Update by asking Claude.
// Metric only: sizes in cm and weights in kg (convert inches × 2.54, pounds × 0.4536).

export const AIRLINE_GUIDE_UPDATED = '2026-10-28'

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
  /** `americas`: the biggest airlines of the US and of other countries of the Americas flown to from Brazil. */
  scope: 'international' | 'americas' | 'japan-domestic' | 'brazil'
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
  /** Seat pitch in cm (airlines publish inches: × 2.54), varies by aircraft. */
  legroom?: { economy?: string; premiumEconomy?: string }
  notes: string[]
  /** What the sources didn't settle: check before buying. */
  toConfirm: string[]
  sources: string[]
}

const RESEARCHED: AirlineInfo[] = [
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
    legroom: { economy: '81–86 cm', premiumEconomy: '~102 cm' },
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
    legroom: { economy: '79–81 cm' },
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
    legroom: { economy: '~81 cm' },
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
    legroom: { premiumEconomy: '97–99 cm' },
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
    legroom: { economy: '86 cm', premiumEconomy: '97 cm' },
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
  // Brazilian airlines: usually the first flight (e.g. Navegantes → São Paulo) before the long-haul one.
  // Researched on their own pages on 2026-10-21.
  {
    code: 'LA',
    name: 'LATAM',
    aliases: ['latam', 'latam airlines', 'latam brasil', 'tam'],
    scope: 'brazil',
    type: 'full-service',
    hub: 'São Paulo (GRU)',
    personalItem: { cm: [45, 35, 20], kg: 10, note: 'all fares; under the seat in front' },
    carryOn: { cm: [55, 35, 25], kg: 12, note: 'not on Basic (only on some short international routes); 16 kg in Premium cabins' },
    checked: [
      { fare: 'Basic', pieces: 0, note: 'can be bought' },
      { fare: 'Light', pieces: 0, note: 'can be bought' },
      { fare: 'Standard', pieces: 1, kgEach: 23 },
      { fare: 'Full', pieces: 1, kgEach: 23 },
      { fare: 'Premium Economy', pieces: 1, kgEach: 23 },
    ],
    checkedMax: { linearCm: 158, kg: 23 },
    premiumEconomy: 'some aircraft',
    notes: [
      'On one ticket with an international airline, the checked bags usually follow the long-haul airline’s rules; carry-on follows each airline flown.',
    ],
    toConfirm: ['Allowance on your exact ticket (it depends on route and fare)'],
    sources: [
      'https://www.latamairlines.com/br/pt/experiencia/prepare-sua-viagem/bagagem/bagagem-de-mao',
      'https://www.latamairlines.com/br/pt/experiencia/prepare-sua-viagem/bagagem/bagagem-despachada',
    ],
  },
  {
    code: 'G3',
    name: 'GOL',
    aliases: ['gol', 'gol linhas aéreas', 'gol linhas aereas'],
    scope: 'brazil',
    type: 'low-cost',
    hub: 'São Paulo (GRU, CGH)',
    personalItem: { cm: [43, 32, 22], kg: 10, note: 'under the seat in front' },
    carryOn: { cm: [55, 35, 25], kg: 12, note: 'tickets issued from 14 Oct 2025 (10 kg before); not on Basic; may be sent to the hold at the gate' },
    checked: [
      { fare: 'Basic', pieces: 0, note: 'can be bought' },
      { fare: 'Light', pieces: 0, note: 'can be bought; included for Smiles Silver and above' },
      { fare: 'Classic', pieces: 1, kgEach: 23 },
      { fare: 'Flex', pieces: 1, kgEach: 23 },
      { fare: 'Premium Economy', pieces: 1, kgEach: 23 },
    ],
    checkedMax: { cm: [80, 50, 28], kg: 23 },
    premiumEconomy: 'some aircraft',
    notes: ['Fares renamed: Classic was "Plus", Flex was "Max".'],
    toConfirm: ['Allowance on your exact ticket'],
    sources: ['https://www.voegol.com.br/informacoes/bagagem'],
  },
  {
    code: 'AD',
    name: 'Azul',
    aliases: ['azul', 'azul linhas aéreas', 'azul linhas aereas'],
    scope: 'brazil',
    type: 'full-service',
    hub: 'Campinas (VCP)',
    personalItem: { cm: [45, 35, 20], note: 'under the seat in front' },
    carryOn: { cm: [55, 35, 25], kg: 10 },
    checked: [
      { fare: 'Azul', pieces: 0, note: 'can be bought' },
      { fare: 'MaisAzul', pieces: 1, kgEach: 23 },
      { fare: 'Azul Super', pieces: '1 or more', note: 'confirm' },
    ],
    checkedMax: { cm: [80, 50, 28], kg: 23 },
    premiumEconomy: 'some aircraft',
    notes: ['Azul Fidelidade levels (Topázio and above) add free checked bags.'],
    toConfirm: ['Azul Super allowance', 'Allowance on your exact ticket'],
    sources: ['https://www.voeazul.com.br/br/pt/sua-viagem/planeje/bagagens'],
  },
  // The Americas (2026-10-28). US airlines read on their own pages in the browser; where a page only offers a fee
  // calculator, the allowance is from secondary sources and listed under "to confirm".
  {
    code: 'AA',
    name: 'American Airlines',
    aliases: ['american', 'american airlines'],
    scope: 'americas',
    type: 'full-service',
    alliance: 'oneworld',
    hub: 'Miami (MIA), Dallas (DFW)',
    personalItem: { cm: [45, 35, 20], note: 'under the seat in front' },
    carryOn: { cm: [56, 36, 23], note: 'no weight limit published' },
    checked: [
      { fare: 'Basic Economy', pieces: 0, note: 'to/from Brazil the 1st bag is USD 70' },
      { fare: 'Main Cabin', pieces: 1, kgEach: 23, note: 'to/from Brazil; inside the US no bag is included' },
      { fare: 'Main Plus', pieces: 2, kgEach: 23 },
      { fare: 'Premium Economy', pieces: 2, kgEach: 23 },
    ],
    checkedMax: { linearCm: 158, kg: 23 },
    premiumEconomy: 'some aircraft',
    legroom: { economy: '~76–79 cm' },
    notes: [
      'Inside the US every economy fare pays for bags (USD 45–55 the 1st, paying online).',
      'Basic Economy keeps the carry-on and the personal item.',
    ],
    toConfirm: ['Legroom of your aircraft', 'Premium Economy only on wide-body aircraft'],
    sources: ['https://www.aa.com/i18n/travel-info/baggage/checked-baggage-policy.jsp', 'https://www.aa.com/i18n/travel-info/baggage/carry-on-baggage.jsp'],
  },
  {
    code: 'DL',
    name: 'Delta Air Lines',
    aliases: ['delta'],
    scope: 'americas',
    type: 'full-service',
    alliance: 'SkyTeam',
    hub: 'Atlanta (ATL)',
    personalItem: { note: 'no size published: must fit under the seat in front' },
    carryOn: { cm: [56, 35, 23], linearCm: 114, note: 'no weight limit published' },
    checked: [
      { fare: 'Delta Main Basic', pieces: 0, note: 'to/from Brazil the 1st bag is USD 70' },
      { fare: 'Delta Main Classic', pieces: 1, kgEach: 23, note: 'to/from Brazil (confirm); inside the US none' },
      { fare: 'Delta Comfort', pieces: 1, kgEach: 23, note: 'confirm' },
      { fare: 'Delta Premium Select', pieces: 2, kgEach: 23, note: 'confirm' },
    ],
    checkedMax: { linearCm: 157, kg: 23 },
    premiumEconomy: 'some aircraft',
    legroom: { economy: '~76–79 cm' },
    notes: ['Inside the US the 1st bag is USD 45 and the 2nd USD 55 (Delta Main and Delta Comfort).', 'Delta Main Basic keeps the carry-on and the personal item.'],
    toConfirm: ['Free bags to/from Brazil per fare (Delta shows them in its baggage calculator)', 'Premium Select only on wide-body aircraft'],
    sources: ['https://pt.delta.com/br/pt/baggage/overview', 'https://www.delta.com/us/en/baggage/carry-on-baggage'],
  },
  {
    code: 'UA',
    name: 'United Airlines',
    aliases: ['united'],
    scope: 'americas',
    type: 'full-service',
    alliance: 'Star Alliance',
    hub: 'Houston (IAH), Newark (EWR)',
    personalItem: { cm: [43, 25, 22] },
    carryOn: { cm: [56, 35, 23], note: 'Basic Economy: personal item only, except to/from South America, across the Atlantic or the Pacific' },
    checked: [
      { fare: 'Basic Economy', pieces: 0, note: 'paid bags' },
      { fare: 'Economy', pieces: 1, kgEach: 23, note: 'to/from South America (confirm); inside the US none' },
      { fare: 'Premium Plus', pieces: 2, kgEach: 23, note: 'confirm' },
    ],
    checkedMax: { cm: [76, 52, 30], linearCm: 158, kg: 23 },
    premiumEconomy: 'some aircraft',
    legroom: { economy: '~76–79 cm' },
    notes: ['Inside the US bags start at USD 45 prepaid (tickets bought from 3 April 2026).'],
    toConfirm: ['Free bags to/from Brazil per fare (United shows them in its bag fee calculator)', 'Premium Plus only on wide-body aircraft'],
    sources: ['https://www.united.com/en/us/fly/baggage/carry-on-bags.html', 'https://www.united.com/en/us/fly/baggage/checked-bags.html'],
  },
  {
    code: 'WN',
    name: 'Southwest Airlines',
    aliases: ['southwest'],
    scope: 'americas',
    type: 'low-cost',
    hub: 'Dallas Love Field (DAL), Chicago Midway (MDW)',
    personalItem: { note: 'no size published: must fit under the seat in front' },
    carryOn: { cm: [61, 41, 25], note: 'no weight limit published' },
    checked: [
      { fare: 'Basic, Choice, Choice Preferred', pieces: 0, note: '1st bag USD 45, 2nd USD 55 (bought from 9 April 2026)' },
      { fare: 'Choice Extra', pieces: 2, kgEach: 23 },
    ],
    checkedMax: { linearCm: 157, kg: 23 },
    premiumEconomy: 'no',
    notes: ['Mostly flights inside the US (and to Mexico and the Caribbean).', 'Bags flew free until May 2025.', 'Some loyalty levels and its credit cards add free bags.'],
    toConfirm: ['Fare names and what each includes (Southwest changed them in 2025)'],
    sources: ['https://support.southwest.com/helpcenter/article/carryon-baggage-policy', 'https://support.southwest.com/helpcenter/article/checked-baggage-policy'],
  },
  {
    code: 'AC',
    name: 'Air Canada',
    aliases: ['air canada'],
    scope: 'americas',
    type: 'full-service',
    alliance: 'Star Alliance',
    hub: 'Toronto (YYZ), Montreal (YUL)',
    personalItem: { cm: [43, 33, 16] },
    carryOn: { cm: [55, 40, 23], note: 'Economy Basic inside Canada, to/from the US, Mexico, Central America and the Caribbean: personal item only' },
    checked: [{ fare: 'Economy (by fare)', pieces: '0–2', kgEach: 23, note: 'Air Canada shows it in its baggage calculator' }],
    checkedMax: { linearCm: 158, kg: 23 },
    premiumEconomy: 'some aircraft',
    notes: ['On trips through Canada or the US, the airline of the first flight sets the bag rules for the whole trip.'],
    toConfirm: ['Free bags to/from Brazil per fare (baggage calculator)'],
    sources: ['https://www.aircanada.com/ca/en/aco/home/plan/baggage/carry-on.html', 'https://www.aircanada.com/ca/en/aco/home/plan/baggage/checked.html'],
  },
  {
    code: 'AM',
    name: 'Aeroméxico',
    aliases: ['aeromexico', 'aeroméxico'],
    scope: 'americas',
    type: 'full-service',
    alliance: 'SkyTeam',
    hub: 'Mexico City (MEX)',
    personalItem: { note: 'must fit under the seat in front' },
    carryOn: { cm: [55, 40, 25], kg: 10, note: '10 kg is the total of carry-on and personal item (secondary sources)' },
    checked: [
      { fare: 'Basic', pieces: 0 },
      { fare: 'Classic', pieces: 1, kgEach: 23 },
      { fare: 'AM Plus', pieces: 1, kgEach: 23 },
      { fare: 'Premier', pieces: 2 },
    ],
    premiumEconomy: 'some aircraft',
    notes: ['Read from secondary sources (Aeroméxico\'s pages were not readable): a starting point only.'],
    toConfirm: ['Everything, on aeromexico.com: allowances to/from Brazil may differ from the rest of South America'],
    sources: ['https://aeromexico.com', 'https://upgradedpoints.com/travel/airlines/aeromexico-baggage-fees/'],
  },
  {
    code: 'CM',
    name: 'Copa Airlines',
    aliases: ['copa'],
    scope: 'americas',
    type: 'full-service',
    alliance: 'Star Alliance',
    hub: 'Panama City (PTY)',
    personalItem: { cm: [43, 25, 22] },
    carryOn: { cm: [56, 36, 26], kg: 10 },
    checked: [
      { fare: 'Economy Basic', pieces: 0 },
      { fare: 'Economy Classic', pieces: 1, kgEach: 23 },
      { fare: 'Economy Full', pieces: 2, kgEach: 23 },
    ],
    checkedMax: { kg: 23 },
    premiumEconomy: 'no',
    notes: ['Many flights from Brazil connect in Panama to the US, Mexico, Central America and the Caribbean.', "Read from secondary sources (Copa's page didn't load): a starting point only."],
    toConfirm: ['Everything, on copaair.com (Baggage information)'],
    sources: ['https://www.copaair.com/en-gs/travel-information/baggage-information/', 'https://upgradedpoints.com/travel/airlines/copa-airlines-baggage-fees/'],
  },
  {
    code: 'AV',
    name: 'Avianca',
    aliases: ['avianca'],
    scope: 'americas',
    type: 'full-service',
    alliance: 'Star Alliance',
    hub: 'Bogotá (BOG)',
    personalItem: { cm: [45, 35, 20], note: 'one source only' },
    carryOn: { cm: [55, 35, 25], kg: 10, note: 'Light fares include it on international flights in the Americas (tickets from 27 January 2026)' },
    checked: [
      { fare: 'Light (XS / S)', pieces: 0 },
      { fare: 'Classic (M / L)', pieces: 1, kgEach: 23 },
      { fare: 'Flex', pieces: 1, kgEach: 23, note: 'confirm' },
    ],
    premiumEconomy: 'no',
    notes: ["The carry-on in Light fares is from Avianca's own news (February 2026); the rest from secondary sources."],
    toConfirm: ['Checked bags per fare to/from Brazil', 'Personal item size'],
    sources: ['https://www.avianca.com/en/about-us/corporate-news/2026/february-2', 'https://upgradedpoints.com/travel/airlines/avianca-baggage-fees/'],
  },
  {
    code: 'AR',
    name: 'Aerolíneas Argentinas',
    aliases: ['aerolineas', 'aerolíneas', 'aerolineas argentinas'],
    scope: 'americas',
    type: 'full-service',
    alliance: 'SkyTeam',
    hub: 'Buenos Aires (AEP, EZE)',
    personalItem: { note: 'size not confirmed' },
    carryOn: { note: 'size and weight not confirmed; inside Argentina the cheapest fare has only a 3 kg bag (tickets from 4 May 2026)' },
    checked: [{ fare: 'International (by fare)', pieces: 'varies', kgEach: 23, note: 'an extra bag to Brazil costs USD 40 online' }],
    checkedMax: { kg: 23 },
    premiumEconomy: 'some aircraft',
    notes: ['Bags on international flights up to 23 kg (Colombia 20 kg, Mexico 25 kg).', 'Read from news and secondary sources: a starting point only.'],
    toConfirm: ['Everything, on aerolineas.com.ar (Equipaje)'],
    sources: ['https://www.aerolineas.com.ar', 'https://www.infoviajera.com/?p=173069'],
  },
]

const bagMetric = <T extends BagRule | null>(bag: T): T => (bag?.note ? { ...bag, note: metric(bag.note) } : bag)

/**
 * The guide, metric everywhere: any inches or pounds left in a text copied
 * from an airline's page are shown in cm or kg.
 */
export const AIRLINES: AirlineInfo[] = RESEARCHED.map((a) => ({
  ...a,
  personalItem: bagMetric(a.personalItem),
  carryOn: bagMetric(a.carryOn),
  cabinNote: a.cabinNote && metric(a.cabinNote),
  checked: a.checked.map((r) => (r.note ? { ...r, note: metric(r.note) } : r)),
  checkedMax: a.checkedMax && bagMetric(a.checkedMax),
  legroom: a.legroom && {
    economy: a.legroom.economy && metric(a.legroom.economy),
    premiumEconomy: a.legroom.premiumEconomy && metric(a.legroom.premiumEconomy),
  },
  notes: a.notes.map(metric),
  toConfirm: a.toConfirm.map(metric),
}))

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

/**
 * A bag that fits every one of these rules: smallest size on each side and
 * lowest weight. null when some airline allows no separate item.
 */
export function strictestBag(bags: (BagRule | null)[]): BagRule | null {
  if (bags.length === 0 || bags.some((b) => b === null)) return null
  const rules = bags as BagRule[]
  const min = (values: (number | undefined)[]) => {
    const known = values.filter((v): v is number => v != null)
    return known.length ? Math.min(...known) : undefined
  }
  // Sides compared largest with largest, so 55×40×20 and 56×36×23 give 55×36×20.
  const sides = rules.filter((r) => r.cm).map((r) => [...r.cm!].sort((a, b) => b - a))
  return {
    cm: sides.length ? ([0, 1, 2].map((i) => Math.min(...sides.map((s) => s[i]))) as [number, number, number]) : undefined,
    linearCm: min(rules.map((r) => r.linearCm)),
    kg: min(rules.map((r) => r.kg)),
  }
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
