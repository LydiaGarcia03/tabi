import { useEffect, useRef, useState, type DragEvent } from 'react'
import { MAX_PHOTOS, resizeImage } from '../db/photos'
import { Icon } from './Icon'

/** Shows a stored image through a temporary URL, released when no longer shown. */
function BlobImage({ image, alt }: { image: Blob; alt: string }) {
  const img = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const url = URL.createObjectURL(image)
    if (img.current) img.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [image])
  return <img ref={img} alt={alt} />
}

/** Small photos in a row; tapping one opens it big. */
export function PhotoStrip({ images, name }: { images: Blob[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null)
  if (images.length === 0) return null
  return (
    <>
      <span className="photo-strip">
        {images.map((image, i) => (
          <button key={i} type="button" className="photo-thumb" onClick={() => setOpen(i)} aria-label={`Photo ${i + 1} of ${name}`}>
            <BlobImage image={image} alt="" />
          </button>
        ))}
      </span>
      {open !== null && <PhotoViewer images={images} start={open} name={name} onClose={() => setOpen(null)} />}
    </>
  )
}

function PhotoViewer({ images, start, name, onClose }: { images: Blob[]; start: number; name: string; onClose: () => void }) {
  const [index, setIndex] = useState(start)
  const dialog = useRef<HTMLDialogElement>(null)
  const step = (delta: number) => setIndex((i) => (i + delta + images.length) % images.length)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  return (
    <dialog
      ref={dialog}
      className="photo-viewer"
      onClose={onClose}
      // A tap outside the photo (on the dark backdrop) closes it.
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') step(-1)
        if (e.key === 'ArrowRight') step(1)
      }}
    >
      <BlobImage key={index} image={images[index]} alt={`${name}, photo ${index + 1}`} />
      <div className="photo-viewer-bar">
        {images.length > 1 && (
          <button type="button" onClick={() => step(-1)} aria-label="Previous photo">
            ‹
          </button>
        )}
        <span className="small">
          {name}
          {images.length > 1 && ` · ${index + 1}/${images.length}`}
        </span>
        {images.length > 1 && (
          <button type="button" onClick={() => step(1)} aria-label="Next photo">
            ›
          </button>
        )}
        <button type="button" onClick={() => dialog.current?.close()} autoFocus>
          Close
        </button>
      </div>
    </dialog>
  )
}

/**
 * Editing an option's photos: pick files, paste (Ctrl+V) or drop them.
 * Each one is resized on the device before it is kept.
 */
export function PhotoPicker({ images, onChange }: { images: Blob[]; onChange: (images: Blob[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
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

  const move = (i: number, delta: number) => {
    const next = [...images]
    ;[next[i], next[i + delta]] = [next[i + delta], next[i]]
    onChange(next)
  }

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
      <div className="photo-picker-list">
        {images.map((image, i) => (
          <figure key={i} className="photo-picker-item">
            <BlobImage image={image} alt={`Photo ${i + 1}`} />
            <figcaption>
              <button type="button" className="link" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move left">
                <Icon name="back" size={16} />
              </button>
              <button type="button" className="link" onClick={() => onChange(images.filter((_, j) => j !== i))}>
                Remove
              </button>
            </figcaption>
          </figure>
        ))}
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
      <p className="muted small">From your gallery or files; on the PC you can also paste (Ctrl+V) or drop images here. Kept only on this device (and in backups).</p>
      {error && <p className="error small">{error}</p>}
    </div>
  )
}
