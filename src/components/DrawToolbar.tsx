import { useState } from 'react'
import { updateSegment } from '../db/legs'
import { drawingPoints, streetTravelMode, type Drawing } from '../drawing'
import { MODE_LABEL, formatDistance, formatDuration } from '../format'
import { MAX_MIDDLE_POINTS, snapToStreets } from '../routing/googleProvider'
import { RouteProviderError } from '../routing/types'
import { InfoTip } from './InfoTip'
import { LineColorPicker } from './LineColorPicker'

interface Props {
  drawing: Drawing
  onChange: (drawing: Drawing | null) => void
}

/** Controls shown under the map while a segment is being drawn. */
export function DrawToolbar({ drawing, onChange }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const points = drawingPoints(drawing)
  const travelMode = streetTravelMode(drawing.mode)
  const tooManyPoints = points.length - 2 > MAX_MIDDLE_POINTS

  async function followStreets() {
    if (!travelMode) return
    setBusy(true)
    setError('')
    try {
      onChange({ ...drawing, snapped: await snapToStreets(points, travelMode) })
    } catch (err) {
      setError(err instanceof RouteProviderError || err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    const snapped = drawing.snapped
    await updateSegment(drawing.fromPlaceId, drawing.toPlaceId, drawing.segmentId, (segment) => ({
      path: snapped?.path ?? points,
      color: drawing.color,
      // Fill in distance/time from Google only where the user left them empty.
      distanceMeters: segment.distanceMeters ?? snapped?.distanceMeters,
      durationMinutes: segment.durationMinutes ?? snapped?.durationMinutes,
    }))
    onChange(null)
  }

  return (
    <div className="card draw-toolbar">
      {/* Compact: the whole box should fit under the map without scrolling the page. */}
      <div className="row between draw-toolbar-head">
        <strong>Drawing: {MODE_LABEL[drawing.mode]}</strong>
        <span className="small muted">
          {points.length} point{points.length === 1 ? '' : 's'}
          {drawing.snapped && (
            <>
              {' '}
              · follows streets: {formatDistance(drawing.snapped.distanceMeters)}, {formatDuration(drawing.snapped.durationMinutes)}
            </>
          )}
        </span>
      </div>
      <p className="small muted">
        {drawing.start ? 'Starts at the green dot. ' : 'Tap where it starts. '}
        Tap the map to add points{drawing.end ? '; it ends at the red dot.' : ', the last one where this step ends.'}
        {!travelMode && ' Trains, subways and ferries are drawn as straight lines: tap along the tracks.'}
      </p>
      {drawing.origin && (
        <label className="small row">
          <input
            type="checkbox"
            checked={!!drawing.start}
            onChange={(e) =>
              onChange({
                ...drawing,
                start: e.target.checked && drawing.origin ? { lat: drawing.origin.lat, lng: drawing.origin.lng } : undefined,
                snapped: undefined,
              })
            }
          />
          {drawing.origin.label}
        </label>
      )}
      {drawing.destination && (
        <label className="small row">
          <input
            type="checkbox"
            checked={!!drawing.end}
            onChange={(e) =>
              onChange({
                ...drawing,
                end: e.target.checked && drawing.destination ? { lat: drawing.destination.lat, lng: drawing.destination.lng } : undefined,
                snapped: undefined,
              })
            }
          />
          End at {drawing.destination.name}
        </label>
      )}
      {drawing.mode !== 'walk' && (
        <LineColorPicker mode={drawing.mode} color={drawing.color} onChange={(color) => onChange({ ...drawing, color })} />
      )}
      {tooManyPoints && (
        <p className="error">Following streets allows at most {MAX_MIDDLE_POINTS} points between start and end.</p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="row wrap">
        <button
          type="button"
          disabled={drawing.taps.length === 0}
          onClick={() => onChange({ ...drawing, taps: drawing.taps.slice(0, -1), snapped: undefined })}
        >
          Undo point
        </button>
        <button
          type="button"
          disabled={drawing.taps.length === 0}
          onClick={() => onChange({ ...drawing, taps: [], snapped: undefined })}
        >
          Clear
        </button>
        {travelMode && (
          <span className="row draw-follow">
            <button type="button" disabled={busy || points.length < 2 || tooManyPoints || !!drawing.snapped} onClick={followStreets}>
              {busy ? 'Asking Google…' : 'Follow streets'}
            </button>
            <InfoTip label="About Follow streets">“Follow streets” uses 1 Google request.</InfoTip>
          </span>
        )}
        <button type="button" className="primary" disabled={points.length < 2} onClick={save}>
          Save
        </button>
        <button type="button" onClick={() => onChange(null)}>
          Cancel
        </button>
      </div>
    </div>
  )
}
