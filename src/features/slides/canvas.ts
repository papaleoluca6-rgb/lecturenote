// Utility canvas condivise da import PDF e immagini.

/**
 * Lato lungo massimo della slide salvata. A schermo pieno la slide è larga ~1300 pixel reali sul tablet:
 * 3000 la tiene nitida fino a zoom ~2,5× (con 1600 si sgranava subito). Circa 300-600 KB a pagina in JPEG.
 */
export const MAX_SIDE = 3000
/** Larghezza delle miniature (salvate a parte per non decodificare 100 immagini grandi nella barra). */
export const THUMB_W = 240

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Conversione immagine non riuscita'))), type, quality),
  )
}

/** Libera subito la memoria della canvas (su Chrome Android non aspetta il garbage collector). */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
}

/** Disegna una sorgente in una canvas nuova di dimensione w×h, con sfondo bianco (i PNG trasparenti diventano leggibili). */
export function drawScaled(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Canvas non disponibile')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(src, 0, 0, c.width, c.height)
  return c
}

/** Miniatura JPEG larga THUMB_W a partire da una canvas già renderizzata. */
export async function makeThumb(src: HTMLCanvasElement | HTMLImageElement, w: number, h: number): Promise<Blob> {
  const c = drawScaled(src, THUMB_W, (h / w) * THUMB_W)
  try {
    return await canvasToBlob(c, 'image/jpeg', 0.7)
  } finally {
    releaseCanvas(c)
  }
}
