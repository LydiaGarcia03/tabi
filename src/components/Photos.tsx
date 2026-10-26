import { useEffect, useRef, useState, type DragEvent } from 'react'
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

/**
 * All the photos of an option, big, one at a time: swipe or the side arrows
 * (← → keys) to move, the row below to jump to one. Full screen on phones.
 * Rendered on <body> so no table or card around the opener can get in the way.
 */
export function PhotoViewer({ images, start, name, onClose }: { images: Blob[]; start: number; name: string; onClose: () => void }) {
  const [index, setIndex] = useState(start)
  const [dragX, setDragX] = useState(0)
  const dragFrom = useRef<number | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const many = images.length > 1
  const step = (delta: number) => setIndex((i) => (i + delta + images.length) % images.length)

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  const endDrag = () => {
    if (dragFrom.current === null) return
    dragFrom.current = null
    if (many && Math.abs(dragX) > SWIPE) step(dragX < 0 ? 1 : -1)
    setDragX(0)
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
      // A tap outside the photo (on the dark backdrop) closes it.
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') step(-1)
        if (e.key === 'ArrowRight') step(1)
      }}
    >
      <header className="photo-viewer-head">
        <strong>{name}</strong>
        <button type="button" className="ghost icon-button" onClick={() => dialog.current?.close()} aria-label="Close" autoFocus>
          <Icon name="close" size={20} />
        </button>
      </header>
      <div
        className="photo-viewer-stage"
        onPointerDown={(e) => {
          if (!many || (e.target as HTMLElement).closest('button')) return
          dragFrom.current = e.clientX
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => dragFrom.current !== null && setDragX(e.clientX - dragFrom.current)}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className={`photo-viewer-photo${dragX ? ' dragging' : ''}`} style={{ transform: `translateX(${dragX}px)` }}>
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
              onClick={() => setIndex(i)}
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
