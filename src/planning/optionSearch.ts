// The Options page's search: the options whose texts have every word typed.

import { createContext } from 'react'
import type { TripOption } from '../db/model'

/** Lowercase without accents, so "senso" finds "Sensō-ji". */
export const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** The words typed, folded; none = no search. */
export const searchWords = (query: string) => fold(query).split(/\s+/).filter(Boolean)

/** Searched in: name, type, city, notes, address and, for transport, the route and the carriers. */
function searchText(o: TripOption): string {
  const j = o.journey
  const route = j ? [j.from, j.to, j.carrier, j.number, ...(j.legs ?? []).flatMap((l) => [l.from, l.to, l.carrier, l.number])] : []
  return fold([o.name, o.category, o.city, o.notes, o.address, ...route].filter(Boolean).join(' '))
}

export function matchesSearch(o: TripOption, words: string[]): boolean {
  if (words.length === 0) return true
  const text = searchText(o)
  return words.every((w) => text.includes(w))
}

/**
 * Where the words are in `text`: [start, end) ranges, merged. Folding by NFD keeps
 * the base letters' positions only for texts whose accents are combining marks, so
 * the text is folded letter by letter to map positions back.
 */
export function matchRanges(text: string, words: string[]): [number, number][] {
  if (words.length === 0) return []
  // Folded text plus, for each folded character, the index of the original character it came from.
  let folded = ''
  const from: number[] = []
  ;[...text].reduce((i, ch) => {
    const f = fold(ch)
    folded += f
    for (let k = 0; k < f.length; k++) from.push(i)
    return i + ch.length
  }, 0)
  const marks = new Array<boolean>(text.length).fill(false)
  for (const w of words) {
    for (let at = folded.indexOf(w); at >= 0; at = folded.indexOf(w, at + 1)) {
      const start = from[at]
      const last = from[at + w.length - 1]
      const end = last + ([...text.slice(last)][0]?.length ?? 1)
      for (let k = start; k < end; k++) marks[k] = true
    }
  }
  const ranges: [number, number][] = []
  marks.forEach((m, i) => {
    if (!m) return
    const prev = ranges[ranges.length - 1]
    if (prev && prev[1] === i) prev[1] = i + 1
    else ranges.push([i, i + 1])
  })
  return ranges
}

/** The words being searched, for the rows to highlight them. */
export const SearchWordsContext = createContext<string[]>([])
