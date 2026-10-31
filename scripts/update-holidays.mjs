// Builds public/holidays/<CC>.json: the public holidays (days off) of every country, national and regional, for
// the next years, from the date-holidays package (ISC; its data CC-BY-3.0), used only here (a devDependency: the
// library itself is big and isn't shipped). The app fetches one small file per trip country and keeps it on the device.
// Run manually now and then (each year, to move the range forward): `npm run holidays:update`, then commit the files.

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Holidays = require('date-holidays')

const FIRST_YEAR = new Date().getFullYear()
const YEARS = 7
const OUTPUT = new URL('../public/holidays/', import.meta.url)

/** Days off only ("public"); bank holidays, observances and optional days are left out. */
const publicDays = (hd, year) =>
  hd
    .getHolidays(year, 'en')
    .filter((h) => h.type === 'public')
    .map((h) => [h.date.slice(0, 10), h.name])

await rm(OUTPUT, { recursive: true, force: true })
await mkdir(OUTPUT, { recursive: true })

const hd = new Holidays()
const countries = Object.keys(hd.getCountries())
let total = 0
for (const country of countries) {
  hd.init(country)
  const regions = hd.getStates(country, 'en') ?? {}
  const localRegions = hd.getStates(country) ?? {}
  const national = []
  /** "date|name" → region codes where it is a day off, for days off that aren't national. */
  const regional = new Map()
  for (let year = FIRST_YEAR; year < FIRST_YEAR + YEARS; year++) {
    hd.init(country)
    const nationalDays = publicDays(hd, year)
    national.push(...nationalDays)
    const isNational = new Set(nationalDays.map(([date, name]) => `${date}|${name}`))
    for (const region of Object.keys(regions)) {
      hd.init(country, region)
      for (const [date, name] of publicDays(hd, year)) {
        const key = `${date}|${name}`
        if (isNational.has(key)) continue
        regional.set(key, [...(regional.get(key) ?? []), region])
      }
    }
  }
  if (national.length === 0 && regional.size === 0) continue
  const file = {
    from: FIRST_YEAR,
    to: FIRST_YEAR + YEARS - 1,
    // English name and, when different, the local one (addresses may use either).
    regions: Object.fromEntries(
      Object.entries(regions).map(([code, name]) => [code, localRegions[code] && localRegions[code] !== name ? [name, localRegions[code]] : [name]]),
    ),
    national,
    regional: [...regional].map(([key, codes]) => [...key.split('|'), codes]),
  }
  const json = JSON.stringify(file)
  total += json.length
  await writeFile(new URL(`${country}.json`, OUTPUT), json)
}
console.log(`${countries.length} countries, ${FIRST_YEAR}–${FIRST_YEAR + YEARS - 1}: ${Math.round(total / 1024)} kB in public/holidays/`)
