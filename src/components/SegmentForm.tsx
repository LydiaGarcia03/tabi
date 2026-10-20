import { useState, type FormEvent } from 'react'
import type { Segment } from '../db/model'
import { MODE_LABEL } from '../format'
import type { SegmentMode } from '../routing/types'

const MODES = Object.keys(MODE_LABEL) as SegmentMode[]

interface Props {
  segment?: Segment
  /** Prefilled stop names for a new segment. */
  defaults?: { fromName?: string; toName?: string }
  onSave: (segment: Segment) => void
  /** Saves, then starts drawing the segment on the map. Hidden when not given. */
  onSaveAndDraw?: (segment: Segment) => void
  onCancel: () => void
}

/** Manual entry or editing of one segment. Unknown fields (path, times) are kept. */
export function SegmentForm({ segment, defaults, onSave, onSaveAndDraw, onCancel }: Props) {
  const [mode, setMode] = useState<SegmentMode>(segment?.mode ?? 'walk')
  const [lineName, setLineName] = useState(segment?.lineName ?? '')
  const [operator, setOperator] = useState(segment?.operator ?? '')
  const [fromName, setFromName] = useState(segment?.fromName ?? defaults?.fromName ?? '')
  const [toName, setToName] = useState(segment?.toName ?? defaults?.toName ?? '')
  const [minutes, setMinutes] = useState(segment?.durationMinutes?.toString() ?? '')
  const [fare, setFare] = useState(segment?.fare?.amount.toString() ?? '')
  const [notes, setNotes] = useState(segment?.notes ?? '')

  function submit(e: FormEvent) {
    e.preventDefault()
    // Which button submitted the form decides whether drawing starts afterwards.
    const draw = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'draw'
    const trimmedLine = lineName.trim() || undefined
    const fareAmount = toNumber(fare)
    const save = draw && onSaveAndDraw ? onSaveAndDraw : onSave
    save({
      path: [],
      ...segment,
      id: segment?.id ?? crypto.randomUUID(),
      mode,
      lineName: mode === 'walk' ? undefined : trimmedLine,
      operator: operator.trim() || undefined,
      fromName: fromName.trim() || undefined,
      toName: toName.trim() || undefined,
      durationMinutes: toNumber(minutes),
      fare: fareAmount != null ? { amount: fareAmount, currency: segment?.fare?.currency ?? 'JPY' } : undefined,
      notes: notes.trim() || undefined,
      // Edited names replace the translated ones; drop originals that no longer apply.
      originalNames:
        segment?.originalNames && trimmedLine === segment.lineName && fromName === segment.fromName && toName === segment.toName
          ? segment.originalNames
          : undefined,
    })
  }

  return (
    <form className="segment-form" onSubmit={submit}>
      <label>
        Mode
        <select value={mode} onChange={(e) => setMode(e.target.value as SegmentMode)}>
          {MODES.map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      {mode !== 'walk' && (
        <div className="row wrap">
          <label>
            Line
            <input value={lineName} onChange={(e) => setLineName(e.target.value)} placeholder="Ginza Line, bus 7…" />
          </label>
          <label>
            Operator
            <input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="Tokyo Metro" />
          </label>
        </div>
      )}
      <div className="row wrap">
        <label>
          From
          <input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Stop or street" />
        </label>
        <label>
          To
          <input value={toName} onChange={(e) => setToName(e.target.value)} placeholder="Stop or street" />
        </label>
      </div>
      <div className="row wrap">
        <label>
          Minutes
          <input type="number" min="0" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </label>
        <label>
          Cost ({segment?.fare?.currency ?? 'JPY'})
          <input type="number" min="0" inputMode="decimal" value={fare} onChange={(e) => setFare(e.target.value)} />
        </label>
      </div>
      <label>
        Notes
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Platform, car to board, tips…" />
      </label>
      <div className="row wrap">
        <button type="submit" className="primary">
          Save segment
        </button>
        {onSaveAndDraw && (
          <button type="submit" value="draw">
            Save &amp; draw on map
          </button>
        )}
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function toNumber(text: string): number | undefined {
  const value = Number(text)
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 ? value : undefined
}
