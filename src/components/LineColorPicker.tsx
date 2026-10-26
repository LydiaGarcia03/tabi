import { MODE_COLOR } from '../format'
import type { SegmentMode } from '../routing/types'

/** Colors of well-known lines (Tokyo Metro and JR), so a hand-made segment can match the signs. */
const SWATCHES = ['#dc3a32', '#f39700', '#9acd32', '#009944', '#00ada9', '#0079c2', '#9b7cb6', '#b6007a', '#bb641d', '#9caeb7']

/** The color of a ride's line on the maps and in its badge: the mode's default or a common line color. */
export function LineColorPicker({
  mode,
  color,
  onChange,
}: {
  mode: SegmentMode
  /** Undefined = the mode's default color. */
  color?: string
  onChange: (color: string | undefined) => void
}) {
  const current = (color ?? MODE_COLOR[mode]).toLowerCase()
  return (
    <div className="line-colors" role="radiogroup" aria-label="Line color">
      <button
        type="button"
        role="radio"
        aria-checked={color == null}
        className="line-color default"
        style={{ background: MODE_COLOR[mode] }}
        title="Default color"
        onClick={() => onChange(undefined)}
      />
      {SWATCHES.filter((swatch) => swatch !== MODE_COLOR[mode]).map((swatch) => (
        <button
          key={swatch}
          type="button"
          role="radio"
          aria-checked={color != null && current === swatch}
          aria-label={swatch}
          className="line-color"
          style={{ background: swatch }}
          onClick={() => onChange(swatch)}
        />
      ))}
    </div>
  )
}
