/** Lato lungo massimo della foto salvata (come le slide). */
const MAX_SIDE = 1600

function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  const img = new Image()
  return new Promise<HTMLImageElement>((resolve, reject) => {
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Immagine non leggibile'))
    img.src = url
  }).finally(() => URL.revokeObjectURL(url))
}

/** Foto → JPEG (qualità 0.85) con lato lungo al massimo 1600 px; se è già piccola in JPEG resta com'è. */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  const img = await loadImage(file)
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (Math.max(w, h) <= MAX_SIDE && file.type === 'image/jpeg') return file
  const k = Math.min(1, MAX_SIDE / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * k))
  c.height = Math.max(1, Math.round(h * k))
  try {
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('Canvas non disponibile')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return await new Promise<Blob>((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Conversione immagine non riuscita'))), 'image/jpeg', 0.85),
    )
  } finally {
    c.width = 0
    c.height = 0
  }
}
