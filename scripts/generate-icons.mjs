// Generates the app icons (PNG) in public/: a white torii gate on the app's
// red. Plain Node, no dependencies: shapes are rasterized with 4×4
// supersampling and encoded as PNG with zlib. Run manually when the design
// changes (`npm run icons`); the output is committed.

import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const RED = [0xb5, 0x33, 0x2e]
const WHITE = [0xff, 0xff, 0xff]

// Torii shapes in a unit square (x, y from the top-left corner).
const TORII = [
  { x0: 0.16, y0: 0.24, x1: 0.84, y1: 0.31 }, // kasagi (top beam)
  { x0: 0.2, y0: 0.31, x1: 0.8, y1: 0.35 }, // shimaki (under the top beam)
  { x0: 0.47, y0: 0.35, x1: 0.53, y1: 0.45 }, // gakuzuka (center post)
  { x0: 0.23, y0: 0.45, x1: 0.77, y1: 0.5 }, // nuki (second beam)
  { x0: 0.3, y0: 0.35, x1: 0.37, y1: 0.8 }, // left pillar
  { x0: 0.63, y0: 0.35, x1: 0.7, y1: 0.8 }, // right pillar
]

/**
 * @param size   icon size in pixels
 * @param radius corner radius of the background (0 = full square)
 * @param scale  size of the torii (maskable icons keep it inside the safe zone)
 */
function render(size, radius, scale) {
  const samples = 4
  const pixels = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0
      let fg = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / size
          const y = (py + (sy + 0.5) / samples) / size
          if (!insideRoundedSquare(x, y, radius)) continue
          bg++
          // Torii coordinates, scaled around the center.
          const tx = (x - 0.5) / scale + 0.5
          const ty = (y - 0.5) / scale + 0.5 + 0.02
          if (TORII.some((r) => tx >= r.x0 && tx < r.x1 && ty >= r.y0 && ty < r.y1)) fg++
        }
      }
      const total = samples * samples
      const i = (py * size + px) * 4
      for (let c = 0; c < 3; c++) {
        pixels[i + c] = bg ? Math.round((RED[c] * (bg - fg) + WHITE[c] * fg) / bg) : 0
      }
      pixels[i + 3] = Math.round((255 * bg) / total)
    }
  }
  return encodePng(size, pixels)
}

function insideRoundedSquare(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r)
  const cy = Math.min(Math.max(y, r), 1 - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

const icons = [
  { file: 'icon-192.png', size: 192, radius: 0.22, scale: 1 },
  { file: 'icon-512.png', size: 512, radius: 0.22, scale: 1 },
  // Full-bleed: the launcher applies its own mask (circle, squircle…).
  { file: 'icon-maskable-512.png', size: 512, radius: 0, scale: 0.75 },
  // iOS rounds the corners itself and shows transparency as black.
  { file: 'apple-touch-icon.png', size: 180, radius: 0, scale: 0.9 },
]
for (const { file, size, radius, scale } of icons) {
  writeFileSync(new URL(`../public/${file}`, import.meta.url), render(size, radius, scale))
  console.log(`public/${file}`)
}
