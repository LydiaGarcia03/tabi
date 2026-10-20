import { useEffect, useRef, useState } from 'react'

/**
 * Local editable copy of a stored value, saved automatically shortly after
 * the user stops typing (and when the component unmounts).
 */
export function useDraft<T>(value: T, save: (value: T) => void, delayMs = 500): [T, (value: T) => void] {
  const [draft, setDraft] = useState(value)
  const pending = useRef<{ value: T } | null>(null)
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })

  useEffect(() => {
    if (!pending.current) return
    const timer = setTimeout(() => {
      if (pending.current) saveRef.current(pending.current.value)
      pending.current = null
    }, delayMs)
    return () => clearTimeout(timer)
  }, [draft, delayMs])

  // Flush unsaved edits when leaving.
  useEffect(
    () => () => {
      if (pending.current) saveRef.current(pending.current.value)
    },
    [],
  )

  function update(next: T) {
    pending.current = { value: next }
    setDraft(next)
  }

  return [draft, update]
}
