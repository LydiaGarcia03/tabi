// Builds src/data/japanese-names.json: official English names of Japanese
// railway stations, lines and operators, from Wikidata (CC0 open data).
// Run manually when names need refreshing: `npm run names:update`.

import { writeFile } from 'node:fs/promises'

const ENDPOINT = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'TabiTripPlanner/0.1 (https://github.com/LydiaGarcia03/tabi)'
const OUTPUT = new URL('../src/data/japanese-names.json', import.meta.url)

// Railway stations (incl. metro, tram...) in Japan with Japanese and English labels.
const STATIONS_QUERY = `
SELECT ?item ?ja ?en ?coord WHERE {
  ?item wdt:P31/wdt:P279* wd:Q55488; wdt:P17 wd:Q17; wdt:P625 ?coord.
  ?item rdfs:label ?ja FILTER(LANG(?ja) = "ja")
  ?item rdfs:label ?en FILTER(LANG(?en) = "en")
}`

// Railway lines in Japan and their operators, with Japanese aliases so that
// NAVITIME's spellings (e.g. "都営浅草線") also match.
const LINES_QUERY = `
SELECT ?item ?ja ?en WHERE {
  {
    ?item wdt:P31/wdt:P279* wd:Q728937; wdt:P17 wd:Q17.
  } UNION {
    ?line wdt:P31/wdt:P279* wd:Q728937; wdt:P17 wd:Q17; wdt:P137 ?item.
  }
  ?item rdfs:label ?en FILTER(LANG(?en) = "en")
  { ?item rdfs:label ?ja } UNION { ?item skos:altLabel ?ja }
  FILTER(LANG(?ja) = "ja")
}`

async function query(sparql) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ query: sparql }),
  })
  if (!response.ok) throw new Error(`Wikidata answered HTTP ${response.status}: ${await response.text()}`)
  const json = await response.json()
  return json.results.bindings
}

/** Normalizes full-width characters (e.g. "ＪＲ" → "JR"). */
function normalize(text) {
  return text.normalize('NFKC').trim()
}

/** Also drops "(...)" disambiguation, used for station names only. */
function clean(text) {
  return normalize(text).replace(/\s*\([^)]*\)\s*/g, ' ').trim()
}

function parsePoint(wkt) {
  const match = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(wkt)
  return match ? [Number(match[2]), Number(match[1])] : null
}

console.log('Fetching stations...')
const stationRows = await query(STATIONS_QUERY)
const stations = new Map()
for (const row of stationRows) {
  const point = parsePoint(row.coord.value)
  if (!point || stations.has(row.item.value)) continue
  const ja = clean(row.ja.value).replace(/駅$/, '')
  const en = clean(row.en.value).replace(/\s+Station$/i, '')
  if (!ja || !en) continue
  stations.set(row.item.value, [ja, en, Number(point[0].toFixed(4)), Number(point[1].toFixed(4))])
}

console.log('Fetching lines and operators...')
const lineRows = await query(LINES_QUERY)
const names = {}
for (const row of lineRows) {
  // Keep parentheses here: "Chūō Line (Rapid)" differs from "Chūō Line".
  const ja = normalize(row.ja.value)
  const en = normalize(row.en.value)
  if (ja && en && !(ja in names)) names[ja] = en
}

const sortedStations = [...stations.values()].sort((a, b) => a[0].localeCompare(b[0], 'ja'))
const sortedNames = Object.fromEntries(Object.entries(names).sort(([a], [b]) => a.localeCompare(b, 'ja')))
const data = {
  source: 'Wikidata (CC0)',
  generatedAt: new Date().toISOString().slice(0, 10),
  stations: sortedStations,
  names: sortedNames,
}
await writeFile(OUTPUT, JSON.stringify(data) + '\n')
console.log(`Saved ${sortedStations.length} stations and ${Object.keys(sortedNames).length} line/operator names.`)
