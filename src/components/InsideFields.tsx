import type { InsideDraft } from '../places/floors'
import { Icon } from './Icon'

/**
 * A place inside a building (User's choice E2 from a mock, 2026-11-01): a short "Floor" field, and once a floor
 * is typed, the building and how to get there. Empty for most places, so it never shows three empty fields.
 */
export function FloorField({ value, onChange }: { value: InsideDraft; onChange: (value: InsideDraft) => void }) {
  return (
    <label className="floor-field">
      Floor
      <input
        value={value.floor}
        placeholder="—"
        maxLength={20}
        onChange={(e) => onChange({ ...value, floor: e.target.value })}
      />
    </label>
  )
}

/** The place editor's version: "Floor [ 9 ]" in one small box, beside the address. */
export function FloorPill({ value, onChange }: { value: InsideDraft; onChange: (value: InsideDraft) => void }) {
  return (
    <label className="pill-field floor-pill">
      <span className="pill-unit">Floor</span>
      <input value={value.floor} placeholder="—" maxLength={20} onChange={(e) => onChange({ ...value, floor: e.target.value })} />
    </label>
  )
}

/** The place editor's version of the building and the way: two boxes with an icon each, no labels. */
export function InsidePills({ value, onChange }: { value: InsideDraft; onChange: (value: InsideDraft) => void }) {
  if (!value.floor.trim()) return null
  return (
    <div className="inside-pills">
      <label className="pill-field" title="Building">
        <Icon name="layers" size={15} />
        <input
          value={value.building}
          placeholder="Building · e.g. Daimaru, North wing"
          aria-label="Building"
          onChange={(e) => onChange({ ...value, building: e.target.value })}
        />
      </label>
      <label className="pill-field" title="How to get there">
        <Icon name="stairs" size={15} />
        <input
          value={value.way}
          placeholder="How to get there · e.g. lifts behind the cosmetics hall"
          aria-label="How to get there"
          onChange={(e) => onChange({ ...value, way: e.target.value })}
        />
      </label>
    </div>
  )
}

/** The building and the way to the floor: only once a floor is typed. */
export function InsideMore({ value, onChange }: { value: InsideDraft; onChange: (value: InsideDraft) => void }) {
  if (!value.floor.trim()) return null
  return (
    <div className="field-row inside-fields">
      <label>
        Building
        <input value={value.building} placeholder="Daimaru, North wing" onChange={(e) => onChange({ ...value, building: e.target.value })} />
      </label>
      <label>
        How to get there
        <input value={value.way} placeholder="Lifts behind the cosmetics hall" onChange={(e) => onChange({ ...value, way: e.target.value })} />
      </label>
    </div>
  )
}
