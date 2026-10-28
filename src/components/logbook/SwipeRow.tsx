import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../Icon'
import { useSwipeRow } from './useSwipeRow'

/** A row of "The day": swiped to the right it is ticked as visited, swiped again unticked. */
export function SwipeRow({ visited, onToggle, className, children }: { visited: boolean; onToggle: () => void; className: string; children: ReactNode }) {
  const { dx, handlers } = useSwipeRow(onToggle)
  return (
    <li className={`swipe-row ${className}${dx ? ' swiping' : ''}`} style={{ '--dx': `${dx}px` } as CSSProperties} {...handlers}>
      <span className={`swipe-under${visited ? ' undo' : ''}`} aria-hidden="true">
        {visited ? (
          'Not visited'
        ) : (
          <>
            <Icon name="check" size={16} /> Visited
          </>
        )}
      </span>
      <div className="swipe-content">{children}</div>
    </li>
  )
}
