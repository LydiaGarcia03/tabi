import { useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { MAX_PHOTOS, resizeImage } from '../db/photos'
import { useReorder } from '../useReorder'
import { Icon } from './Icon'

/** Shows a stored image through a temporary URL, released when no longer shown. */
export function BlobImage({ image, alt, draggable }: { image: Blob; alt: string; draggable?: boolean }) {
  const img = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const url = URL.createObjectURL(image)
    if (img.current) img.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [image])
  return <img ref={img} alt={alt} draggable={draggable} />
}

/** An option's first photo, shown before its name ("+2" when there are more); tapping it opens the carousel. */
export function LeadPhoto({ images, name }: { images: Blob[]; name: string }) {
  const [open, setOpen] = useState(false)
  if (images.length === 0) return null
  return (
    <>
      <button type="button" className="lead-photo" onClick={() => setOpen(true)} aria-label={`Photos of ${name} (${images.length})`}>
        <BlobImage image={images[0]} alt="" />
        {images.length > 1 && <span className="lead-photo-more">+{images.length - 1}</span>}
      </button>
      {open && <PhotoViewer images={images} start={0} name={name} onClose={() => setOpen(false)} />}
    </>
  )
}

// Photos are plain Blobs; each gets a key for the time it is shown (dragging needs stable keys).
const blobIds = new WeakMap<Blob, string>()
let nextBlobId = 0
const blobId = (image: Blob) => {
  if (!blobIds.has(image)) blobIds.set(image, `photo-${nextBlobId++}`)
  return blobIds.get(image)!
}

/** Swipe farther than this (px) to go to the next/previous photo. */
const SWIPE = 50
/** Zoom limits: a double tap goes to TAP_ZOOM, pinching or the wheel up to MAX_ZOOM. */
const MAX_ZOOM = 4
const TAP_ZOOM = 2.5
/** Two taps closer than this (ms, px) are a double tap. */
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_PX = 30

type Point = { x: number; y: number }
/** The photo's zoom: scale and offset (px) from the stage's center. */
type View = { s: number; x: number; y: number }
const NO_ZOOM: View = { s: 1, x: 0, y: 0 }
type Gesture =
  | { kind: 'swipe'; from: number }
  | { kind: 'pan'; from: Point; start: View }
  | { kind: 'pinch'; dist: number; mid: Point; start: View }

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const middle = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/**
 * All the photos of an option, big, one at a time: swipe or the side arrows
 * (← → keys) to move, the row below to jump to one. Full screen on phones.
 * Zoom: pinch or double tap (phones), the wheel or a double click (PC), + − 0 keys;
 * once zoomed, dragging moves the photo instead of changing it.
 * Rendered on <body> so no table or card around the opener can get in the way.
 */
export function PhotoViewer({ images, start, name, onClose }: { images: Blob[]; start: number; name: string; onClose: () => void }) {
  const [index, setIndex] = useState(start)
  const [dragX, setDragX] = useState(0)
  const [view, setViewState] = useState(NO_ZOOM)
  const [moving, setMoving] = useState(false)
  const viewRef = useRef(view)
  const stage = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | null>(null)
  const tap = useRef<{ at: Point; moved: boolean } | null>(null)
  const lastTap = useRef<{ time: number; at: Point } | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const many = images.length > 1
  const zoomed = view.s > 1

  const setView = (next: View) => {
    viewRef.current = next
    setViewState(next)
  }
  const step = (delta: number) => {
    setIndex((i) => (i + delta + images.length) % images.length)
    setView(NO_ZOOM)
  }

  /** A pointer's position from the stage's center. */
  const local = (clientX: number, clientY: number): Point => {
    const rect = stage.current!.getBoundingClientRect()
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 }
  }

  /** Keeps the scale within limits and the zoomed photo covering the stage (no empty side to drag into). */
  const clamp = (v: View): View => {
    const s = Math.min(MAX_ZOOM, Math.max(1, v.s))
    const box = stage.current
    const img = box?.querySelector('img')
    if (s === 1 || !box || !img) return NO_ZOOM
    const maxX = Math.max(0, (img.offsetWidth * s - box.clientWidth) / 2)
    const maxY = Math.max(0, (img.offsetHeight * s - box.clientHeight) / 2)
    return { s, x: Math.min(maxX, Math.max(-maxX, v.x)), y: Math.min(maxY, Math.max(-maxY, v.y)) }
  }

  /** Zooms to `scale` keeping the photo's point under `at` where it is. */
  const zoomAt = (at: Point, scale: number): View => {
    const v = viewRef.current
    const s = Math.min(MAX_ZOOM, Math.max(1, scale))
    const k = s / v.s
    return clamp({ s, x: at.x - k * (at.x - v.x), y: at.y - k * (at.y - v.y) })
  }

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  // The wheel zooms around the mouse. React's wheel listener is passive (can't stop the page's scroll), so it's added here.
  useEffect(() => {
    const element = stage.current
    if (!element) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setView(zoomAt(local(e.clientX, e.clientY), viewRef.current.s * Math.exp(-e.deltaY * 0.002)))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
    // Once is enough: zoomAt and local only read refs.
  }, [])

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()]
    gesture.current = { kind: 'pinch', dist: Math.max(1, distance(a, b)), mid: middle(a, b), start: viewRef.current }
    tap.current = null
    setDragX(0)
  }

  const pointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const at = local(e.clientX, e.clientY)
    pointers.current.set(e.pointerId, at)
    if (pointers.current.size === 1) {
      tap.current = { at, moved: false }
      gesture.current = viewRef.current.s > 1 ? { kind: 'pan', from: at, start: viewRef.current } : many ? { kind: 'swipe', from: at.x } : null
    } else if (pointers.current.size === 2) startPinch()
    setMoving(true)
  }

  const pointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    const at = local(e.clientX, e.clientY)
    pointers.current.set(e.pointerId, at)
    if (tap.current && distance(at, tap.current.at) > 8) tap.current.moved = true
    const g = gesture.current
    if (!g) return
    if (g.kind === 'swipe') setDragX(at.x - g.from)
    else if (g.kind === 'pan') setView(clamp({ ...g.start, x: g.start.x + at.x - g.from.x, y: g.start.y + at.y - g.from.y }))
    else if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const mid = middle(a, b)
      const s = Math.min(MAX_ZOOM, Math.max(1, (g.start.s * distance(a, b)) / g.dist))
      // The photo's point that was under the fingers' middle stays under it (pinching also pans).
      const qx = (g.mid.x - g.start.x) / g.start.s
      const qy = (g.mid.y - g.start.y) / g.start.s
      setView(clamp({ s, x: mid.x - s * qx, y: mid.y - s * qy }))
    }
  }

  const pointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return
    const g = gesture.current
    if (g?.kind === 'swipe') {
      if (Math.abs(dragX) > SWIPE) step(dragX < 0 ? 1 : -1)
      setDragX(0)
      gesture.current = null
    }
    if (pointers.current.size === 1) {
      // One finger left after a pinch: it keeps moving the photo.
      const from = [...pointers.current.values()][0]
      gesture.current = viewRef.current.s > 1 ? { kind: 'pan', from, start: viewRef.current } : null
      return
    }
    if (pointers.current.size > 0) return
    gesture.current = null
    setMoving(false)
    const t = tap.current
    tap.current = null
    if (!t || t.moved || e.type === 'pointercancel') return
    const now = performance.now()
    const last = lastTap.current
    if (last && now - last.time < DOUBLE_TAP_MS && distance(last.at, t.at) < DOUBLE_TAP_PX) {
      lastTap.current = null
      setView(viewRef.current.s > 1 ? NO_ZOOM : zoomAt(t.at, TAP_ZOOM))
    } else lastTap.current = { time: now, at: t.at }
  }

  return createPortal(
    <dialog
      ref={dialog}
      className="photo-viewer"
      aria-label={`Photos of ${name}`}
      // React passes portal events up to the opener's tree: a Sheet around it must not close too.
      onCancel={(e) => e.stopPropagation()}
      onClose={(e) => {
        e.stopPropagation()
        onClose()
      }}
      // A tap outside the photo (on the dark backdrop) closes it. Clicks stop here: through the portal they would
      // reach the opener's tree (an option row opening its details behind the photos).
      onClick={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) dialog.current?.close()
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') step(-1)
        if (e.key === 'ArrowRight') step(1)
        if (e.key === '+' || e.key === '=') setView(zoomAt({ x: 0, y: 0 }, viewRef.current.s * 1.5))
        if (e.key === '-') setView(zoomAt({ x: 0, y: 0 }, viewRef.current.s / 1.5))
        if (e.key === '0') setView(NO_ZOOM)
      }}
    >
      <header className="photo-viewer-head">
        <strong>{name}</strong>
        <button type="button" className="ghost icon-button" onClick={() => dialog.current?.close()} aria-label="Close" autoFocus>
          <Icon name="close" size={20} />
        </button>
      </header>
      <div
        ref={stage}
        className={`photo-viewer-stage${zoomed ? ' zoomed' : ''}`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
      >
        <div
          className={`photo-viewer-photo${dragX || moving ? ' dragging' : ''}`}
          style={{ transform: `translate(${dragX + view.x}px, ${view.y}px) scale(${view.s})` }}
        >
          <BlobImage key={index} image={images[index]} alt={`${name}, photo ${index + 1}`} draggable={false} />
        </div>
        {many && (
          <>
            <button type="button" className="photo-viewer-arrow prev" onClick={() => step(-1)} aria-label="Previous photo">
              <Icon name="back" size={22} />
            </button>
            <button type="button" className="photo-viewer-arrow next" onClick={() => step(1)} aria-label="Next photo">
              <Icon name="forward" size={22} />
            </button>
            <span className="photo-viewer-count">
              {index + 1} / {images.length}
            </span>
          </>
        )}
      </div>
      {many && (
        <div className="photo-viewer-thumbs">
          {images.map((image, i) => (
            <button
              key={i}
              type="button"
              className={i === index ? 'active' : ''}
              aria-current={i === index}
              aria-label={`Photo ${i + 1}`}
              onClick={() => {
                setIndex(i)
                setView(NO_ZOOM)
              }}
            >
              <BlobImage image={image} alt="" />
            </button>
          ))}
        </div>
      )}
    </dialog>,
    document.body,
  )
}

/**
 * Editing an option's photos: pick files, paste (Ctrl+V) or drop them.
 * Each one is resized on the device before it is kept.
 */
export function PhotoPicker({ images, name, onChange }: { images: Blob[]; name: string; onChange: (images: Blob[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [viewing, setViewing] = useState<number | null>(null)
  const room = MAX_PHOTOS - images.length

  async function add(files: File[]) {
    const picked = files.filter((f) => f.type.startsWith('image/'))
    if (picked.length === 0) return
    setError('')
    if (picked.length > room) setError(`Up to ${MAX_PHOTOS} photos: only the first ${room} were added.`)
    setBusy(true)
    try {
      const resized = await Promise.all(picked.slice(0, room).map(resizeImage))
      onChange([...images, ...resized])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  // Pasting an image works anywhere while the form is open (text fields can't take images anyway).
  const addRef = useRef(add)
  useEffect(() => {
    addRef.current = add
  })
  useEffect(() => {
    const onPaste = (e: globalThis.ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])]
      if (!files.some((f) => f.type.startsWith('image/'))) return
      e.preventDefault()
      void addRef.current(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  const byId = new Map(images.map((image) => [blobId(image), image]))
  const { listRef, draggingId, order, handleProps } = useReorder<HTMLDivElement>(
    images.map(blobId),
    async (ids) => onChange(ids.map((id) => byId.get(id)!)),
    'x',
  )

  return (
    <div
      className="field photo-picker"
      onDragOver={(e: DragEvent) => e.preventDefault()}
      onDrop={(e: DragEvent) => {
        e.preventDefault()
        void add([...e.dataTransfer.files])
      }}
    >
      <span className="field-label">
        Photos ({images.length}/{MAX_PHOTOS})
      </span>
      <div className="photo-picker-list" ref={listRef}>
        {order.map((id, i) => {
          const image = byId.get(id)
          if (!image) return null
          return (
            <figure key={id} className={`photo-picker-item${draggingId === id ? ' dragging' : ''}`} data-reorder-id={id}>
              <button
                type="button"
                className="photo-picker-view"
                onClick={() => setViewing(images.indexOf(image))}
                aria-label={`See photo ${i + 1}`}
              >
                <BlobImage image={image} alt={`Photo ${i + 1}`} draggable={false} />
              </button>
              {images.length > 1 && (
                <button
                  type="button"
                  className="photo-picker-grip"
                  aria-label={`Move photo ${i + 1}: drag, or use the arrow keys`}
                  title="Drag to change the order"
                  {...handleProps(id)}
                >
                  <Icon name="grip" size={16} weight={3.2} />
                </button>
              )}
              <button
                type="button"
                className="photo-picker-remove"
                aria-label={`Remove photo ${i + 1}`}
                title="Remove"
                onClick={() => onChange(images.filter((other) => other !== image))}
              >
                <Icon name="trash" size={15} />
              </button>
              {i === 0 && images.length > 1 && <span className="photo-picker-cover">Cover</span>}
            </figure>
          )
        })}
        {room > 0 && (
          <button type="button" className="photo-add" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'Adding…' : '+ Add photos'}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void add([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      {images.length > 1 && <p className="muted small">Drag by the dots to change the order. The first one is the cover, shown in the lists.</p>}
      <p className="muted small">From your gallery or files; on the PC you can also paste (Ctrl+V) or drop images here. Kept only on this device (and in backups).</p>
      {error && <p className="error small">{error}</p>}
      {viewing !== null && <PhotoViewer images={images} start={viewing} name={name} onClose={() => setViewing(null)} />}
    </div>
  )
}
