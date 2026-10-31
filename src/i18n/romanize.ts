// How a name or address in another script reads, in Latin letters, for the driver card's muted line. Done on the
// device for scripts that read letter by letter: Cyrillic (Russian, Ukrainian), Greek and Korean Hangul (Revised
// Romanization, without the sound changes between syllables: close enough to point at). Japanese and Chinese can't be
// read this way (a kanji has several readings): there it's typed, or Google's English address stands in.

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', ё: 'yo', є: 'ye', ж: 'zh', з: 'z', и: 'i', і: 'i', ї: 'yi',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

const GREEK: Record<string, string> = {
  α: 'a', ά: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', έ: 'e', ζ: 'z', η: 'i', ή: 'i', θ: 'th', ι: 'i', ί: 'i', ϊ: 'i', ΐ: 'i',
  κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', ό: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', ύ: 'y',
  ϋ: 'y', ΰ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o', ώ: 'o',
}

const HANGUL_INITIAL = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h']
const HANGUL_VOWEL = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i']
const HANGUL_FINAL = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't']

/** Kana and kanji: no reading letter by letter. */
const NOT_READABLE = /[぀-ヿ㐀-鿿豈-﫿]/

function hangul(code: number): string {
  const index = code - 0xac00
  return HANGUL_INITIAL[Math.floor(index / 588)] + HANGUL_VOWEL[Math.floor((index % 588) / 28)] + HANGUL_FINAL[index % 28]
}

/** The text in Latin letters, or undefined when it has nothing to convert or can't be read letter by letter. */
export function romanize(text: string | undefined): string | undefined {
  if (!text || NOT_READABLE.test(text)) return undefined
  let changed = false
  let out = ''
  for (const char of text) {
    const lower = char.toLowerCase()
    const code = char.codePointAt(0)!
    let latin: string | undefined
    if (code >= 0xac00 && code <= 0xd7a3) latin = hangul(code)
    else latin = CYRILLIC[lower] ?? GREEK[lower]
    if (latin == null) {
      out += char
      continue
    }
    changed = true
    // Keep capitals ("Москва" → "Moskva").
    out += char !== lower && latin ? latin[0].toUpperCase() + latin.slice(1) : latin
  }
  return changed ? out : undefined
}
