// The local language of a place, for its driver card ("Get it from Google" asks Google for the name and address in
// that language).

import { createContext } from 'react'
import { inJapan } from '../data/countries'

/** The language Google writes a country's addresses in (only the trip's countries are looked up). */
const COUNTRY_LANGUAGE: Record<string, string> = {
  JP: 'ja', KR: 'ko', CN: 'zh-CN', TW: 'zh-TW', HK: 'zh-HK', MO: 'zh-HK', TH: 'th', VN: 'vi', KH: 'km', LA: 'lo',
  MM: 'my', IN: 'hi', NP: 'ne', LK: 'si', RU: 'ru', UA: 'uk', BY: 'be', KZ: 'ru', GE: 'ka', AM: 'hy', GR: 'el', CY: 'el',
  BG: 'bg', RS: 'sr', MK: 'mk', IL: 'he', EG: 'ar', SA: 'ar', AE: 'ar', QA: 'ar', JO: 'ar', MA: 'ar', TN: 'ar', TR: 'tr',
  IR: 'fa', MN: 'mn', FR: 'fr', DE: 'de', AT: 'de', IT: 'it', ES: 'es', PT: 'pt', NL: 'nl', PL: 'pl', CZ: 'cs',
  HU: 'hu', SE: 'sv', NO: 'no', DK: 'da', FI: 'fi', ID: 'id', MY: 'ms', PH: 'fil',
}

/** The local language at a point of the trip: Japanese inside Japan, else the first of the trip's other countries. */
export function localLanguage(countries: string[], point: { lat: number; lng: number }): string | undefined {
  if (countries.includes('JP') && inJapan(point)) return 'ja'
  const others = countries.filter((c) => c !== 'JP' || countries.length === 1)
  return others.map((c) => COUNTRY_LANGUAGE[c]).find(Boolean)
}

/** What a driver card needs from its page: the trip's countries (for the language) and whether Google can be asked. */
export const DriverCardContext = createContext<{ countries: string[]; online: boolean }>({ countries: [], online: false })
