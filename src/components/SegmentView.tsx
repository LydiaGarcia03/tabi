import { MODE_COLOR, MODE_LABEL, formatDistance, formatDuration, formatMoney, formatTime } from '../format'
import { translateExit } from '../i18n/japaneseNames'
import type { RouteSegment } from '../routing/types'

/** Read-only details of one segment. */
export function SegmentView({ segment, notes }: { segment: RouteSegment; notes?: string }) {
  const original = segment.originalNames
  return (
    <div className="segment-view" style={{ borderLeftColor: segment.color ?? MODE_COLOR[segment.mode] }}>
      <div>
        <strong>{MODE_LABEL[segment.mode]}</strong>
        {segment.lineName && <> · {segment.lineName}</>}
        {original?.line && (
          <span className="muted small" lang="ja">
            {' '}
            {original.line}
          </span>
        )}
        {segment.operator && <span className="muted"> ({segment.operator})</span>}
      </div>
      {(segment.fromName || segment.toName) && (
        <div className="small">
          {segment.fromName ?? '?'}
          {segment.fromExit && <ExitLabel exit={segment.fromExit} />} → {segment.toName ?? '?'}
          {segment.toExit && <ExitLabel exit={segment.toExit} />}
          {(original?.from || original?.to) && (
            <span className="muted" lang="ja">
              {' '}
              ({original.from ?? segment.fromName} → {original.to ?? segment.toName})
            </span>
          )}
        </div>
      )}
      <div className="small muted">
        {segment.departureTime && (
          <>
            {formatTime(segment.departureTime)}–{formatTime(segment.arrivalTime)} ·{' '}
          </>
        )}
        {formatDuration(segment.durationMinutes)}
        {segment.distanceMeters != null && <> · {formatDistance(segment.distanceMeters)}</>}
        {segment.fare && <> · {formatMoney(segment.fare)}</>}
      </div>
      {notes && <div className="small segment-notes">{notes}</div>}
    </div>
  )
}

function ExitLabel({ exit }: { exit: string }) {
  const english = translateExit(exit)
  return (
    <span className="muted">
      {' '}
      ({english}
      {english !== exit && <span lang="ja"> {exit}</span>})
    </span>
  )
}
