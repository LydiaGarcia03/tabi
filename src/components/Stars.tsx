/** 1–5 rating; tapping the current value clears it. Read-only without `onChange`. */
export function Stars({ value, onChange }: { value?: number; onChange?: (value: number | undefined) => void }) {
  if (!onChange) {
    return (
      <span className="stars" aria-label={value ? `${value} of 5` : 'Not rated'}>
        {value ? '★'.repeat(value) + '☆'.repeat(5 - value) : <span className="muted">—</span>}
      </span>
    )
  }
  return (
    <span className="stars editable" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} of 5`}
          className={value != null && n <= value ? 'on' : ''}
          onClick={() => onChange(value === n ? undefined : n)}
        >
          {value != null && n <= value ? '★' : '☆'}
        </button>
      ))}
    </span>
  )
}
