// Misure e miniature delle slide (le utility canvas generiche sono in lib/image.ts).
import { canvasToBlob, drawScaled, releaseCanvas } from '../../lib/image'

/**
 * Lato lungo massimo della slide salvata. A schermo pieno la slide è larga ~1300 pixel reali sul tablet:
 * 3000 la tiene nitida fino a zoom ~2,5× (con 1600 si sgranava subito). Circa 300-600 KB a pagina in JPEG.
 */
export const MAX_SIDE = 3000
/** Larghezza delle miniature (salvate a parte per non decodificare 100 immagini grandi nella barra). */
export const THUMB_W = 240

/** Miniatura JPEG larga THUMB_W a partire da una canvas già renderizzata. */
export async function makeThumb(src: HTMLCanvasElement | HTMLImageElement, w: number, h: number): Promise<Blob> {
  const c = drawScaled(src, THUMB_W, (h / w) * THUMB_W)
  try {
    return await canvasToBlob(c, 'image/jpeg', 0.7)
  } finally {
    releaseCanvas(c)
  }
}
