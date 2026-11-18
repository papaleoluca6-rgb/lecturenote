import { MAX_SIDE, canvasToBlob, drawScaled, makeThumb, releaseCanvas } from './canvas'
import type { RenderedPage } from './pdfImport'

function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  const img = new Image()
  return new Promise<HTMLImageElement>((resolve, reject) => {
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Immagine non leggibile'))
    img.src = url
  }).finally(() => URL.revokeObjectURL(url))
}

/** Immagine singola → slide. Se è già piccola si tiene il file originale, altrimenti si riduce a MAX_SIDE. */
export async function renderImage(file: Blob): Promise<RenderedPage> {
  const img = await loadImage(file)
  const w = img.naturalWidth
  const h = img.naturalHeight
  const thumb = await makeThumb(img, w, h)
  if (Math.max(w, h) <= MAX_SIDE) return { image: file, thumb, width: w, height: h }
  const k = MAX_SIDE / Math.max(w, h)
  const c = drawScaled(img, w * k, h * k)
  try {
    return { image: await canvasToBlob(c), thumb, width: c.width, height: c.height }
  } finally {
    releaseCanvas(c)
  }
}
