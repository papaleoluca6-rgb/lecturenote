import { canvasToBlob, drawScaled, loadImage, releaseCanvas } from '../../lib/image'

/** Lato lungo massimo della foto salvata (come le slide). */
const MAX_SIDE = 1600

/** Foto → JPEG (qualità 0.85) con lato lungo al massimo 1600 px; se è già piccola in JPEG resta com'è. */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  const img = await loadImage(file)
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (Math.max(w, h) <= MAX_SIDE && file.type === 'image/jpeg') return file
  const k = Math.min(1, MAX_SIDE / Math.max(w, h))
  const c = drawScaled(img, w * k, h * k)
  try {
    return await canvasToBlob(c, 'image/jpeg', 0.85)
  } finally {
    releaseCanvas(c)
  }
}
