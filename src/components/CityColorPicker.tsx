import { CITY_HUES } from '../cityColors'

/**
 * A city's color, like the line color picker (User's choice 4 from a mock, 2026-11-02): the automatic color
 * (next in visiting order) first, set apart by a thin line, then the other city colors as round swatches.
 */
export function CityColorPicker({
  hue,
  autoHue,
  onChange,
}: {
  /** Undefined = automatic. */
  hue?: number
  autoHue: number
  onChange: (hue: number | undefined) => void
}) {
  return (
    <div className="line-colors city-colors" role="radiogroup" aria-label="City color">
      <button
        type="button"
        role="radio"
        aria-checked={hue == null || hue === autoHue}
        aria-label="Automatic color"
        title="Automatic"
        className="line-color city-color"
        style={{ ['--hue' as string]: autoHue }}
        onClick={() => onChange(undefined)}
      />
      <span className="city-colors-gap" aria-hidden="true" />
      {CITY_HUES.filter((h) => h !== autoHue).map((h) => (
        <button
          key={h}
          type="button"
          role="radio"
          aria-checked={hue === h}
          aria-label={`Color ${CITY_HUES.indexOf(h) + 1}`}
          className="line-color city-color"
          style={{ ['--hue' as string]: h }}
          onClick={() => onChange(h)}
        />
      ))}
    </div>
  )
}
