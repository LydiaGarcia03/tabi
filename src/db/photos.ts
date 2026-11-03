// Photos of options, uploaded from the device (no API, nothing leaves the
// device). Resized and re-encoded as JPEG so a backup with photos stays small.

import { db } from './db'
import type { OptionPhoto, TripOption } from './model'

export const MAX_PHOTOS = 3
/** Longest side, in pixels: enough to look at a room or a menu on a PC. */
const MAX_SIDE = 1280
const QUALITY = 0.8

export async function optionPhotos(optionId: string): Promise<OptionPhoto[]> {
  return db.photos.where('optionId').equals(optionId).sortBy('order')
}

/** Replaces the photos of an option with these images, in this order. */
export async function setOptionPhotos(option: Pick<TripOption, 'id' | 'tripId'>, images: Blob[]): Promise<void> {
  await db.transaction('rw', db.photos, async () => {
    await db.photos.where('optionId').equals(option.id).delete()
    await db.photos.bulkAdd(
      images.slice(0, MAX_PHOTOS).map((image, order) => ({ id: crypto.randomUUID(), tripId: option.tripId, optionId: option.id, order, image })),
    )
  })
}

/** Formats kept as they are in HD (every browser shows them); others are re-encoded as JPEG. */
const KEPT_AS_IS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const HD_QUALITY = 0.92

/**
 * Shrinks an image file to at most MAX_SIDE pixels and re-encodes it as JPEG.
 * `hd` keeps its original size (maps, menus with small letters): the file itself
 * when the browser shows its format, else a full-size JPEG.
 */
export async function resizeImage(file: Blob, hd = false): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode().catch(() => {
      throw new Error("Couldn't read this image. Try a JPEG or PNG.")
    })
    if (hd && KEPT_AS_IS.includes(file.type)) return file
    // Browsers apply the photo's EXIF rotation to <img> and to drawImage.
    const scale = hd ? 1 : Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')!
    // JPEG has no transparency: put PNG screenshots on white.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', hd ? HD_QUALITY : QUALITY))
    if (!blob) throw new Error("Couldn't process this image.")
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}
