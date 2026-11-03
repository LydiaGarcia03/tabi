import { useContext, type ReactNode } from 'react'
import { matchRanges, SearchWordsContext } from '../../planning/optionSearch'

/** A text with the words being searched on the Options page highlighted. */
export function SearchMark({ text }: { text: string }) {
  const words = useContext(SearchWordsContext)
  const ranges = matchRanges(text, words)
  if (ranges.length === 0) return <>{text}</>
  const parts: ReactNode[] = []
  let at = 0
  ranges.forEach(([start, end]) => {
    if (start > at) parts.push(text.slice(at, start))
    parts.push(<mark key={start} className="search-mark">{text.slice(start, end)}</mark>)
    at = end
  })
  if (at < text.length) parts.push(text.slice(at))
  return <>{parts}</>
}
