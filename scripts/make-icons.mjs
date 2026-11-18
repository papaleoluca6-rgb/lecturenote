// Genera le icone PNG della PWA in public/icons/ (solo moduli built-in di Node).
// Uso: npm run icons. I PNG generati vanno committati.
import { mkdirSync, writeFileSync } from 'node:fs'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

// Percorso relativo allo script, non alla cartella da cui si lancia il comando.
const OUT = fileURLToPath(new URL('../public/icons/', import.meta.url))

const ACCENT = [0x5b, 0x5f, 0xff]
const WHITE = [255, 255, 255]
const RED = [0xff, 0x40, 0x55]
const SS = 4 // supersampling SS x SS per pixel

const inRRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const cx = Math.min(Math.max(x, x0 + r), x1 - r)
  const cy = Math.min(Math.max(y, y0 + r), y1 - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r

// Colore RGBA nel punto (x, y) in coordinate normalizzate 0..1, oppure null se trasparente.
// Il simbolo (pagina con righe + punto rosso) sta entro il cerchio centrale di raggio 0.4 (safe zone maskable).
function sample(x, y, maskable) {
  if (!maskable && !inRRect(x, y, 0, 0, 1, 1, 0.22)) return null
  if (inCircle(x, y, 0.6, 0.3, 0.065)) return RED
  if (inRRect(x, y, 0.3, 0.2, 0.7, 0.8, 0.04)) {
    for (const ly of [0.44, 0.55, 0.66]) if (inRRect(x, y, 0.37, ly, 0.63, ly + 0.05, 0.025)) return ACCENT
    return WHITE
  }
  return ACCENT
}

let crcTable
const crc32 = (buf) => {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf)
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, n) => {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      return c >>> 0
    })
  }
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), body.length + 4)
  return out
}

function png(size, maskable) {
  const stride = size * 4 + 1
  const raw = Buffer.alloc(stride * size) // filtro 0 per riga (byte iniziale già 0)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, maskable)
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++ }
        }
      }
      const o = py * stride + 1 + px * 4
      if (a) {
        raw[o] = Math.round(r / a)
        raw[o + 1] = Math.round(g / a)
        raw[o + 2] = Math.round(b / a)
        raw[o + 3] = Math.round((a / (SS * SS)) * 255)
      }
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // profondità
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT, { recursive: true })
for (const [name, size, maskable] of [
  ['icon-192', 192, false],
  ['icon-512', 512, false],
  ['maskable-512', 512, true],
]) {
  writeFileSync(`${OUT}${name}.png`, png(size, maskable))
  console.log(`public/icons/${name}.png`)
}
