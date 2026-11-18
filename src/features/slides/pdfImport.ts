// Import PDF con pdf.js (build "legacy": compatibile con il Chrome vecchio del tablet).
// Ogni pagina diventa un'immagine JPEG; si renderizza una pagina alla volta per tenere bassa la memoria.
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { MAX_SIDE, canvasToBlob, makeThumb, releaseCanvas } from './canvas'
import { wordBoxes, type Measure } from './textBoxes'

GlobalWorkerOptions.workerSrc = workerUrl

// Risorse copiate in public/pdfjs da scripts/copy-pdfjs.mjs: servono offline (font standard, mappe CJK per PDF cinesi).
const res = (dir: string) => `${import.meta.env.BASE_URL}pdfjs/${dir}/`

export interface RenderedPage {
  image: Blob
  thumb: Blob
  width: number
  height: number
  /** Parole della pagina (solo PDF con testo vero): vedi Slide.words. */
  words?: number[]
}

/** Renderizza tutte le pagine; `onPage` riceve ogni pagina appena pronta (così si salva subito e si libera memoria). */
export async function renderPdf(
  data: ArrayBuffer,
  onPage: (page: RenderedPage, index: number, total: number) => Promise<void>,
): Promise<number> {
  const task = getDocument({
    data: new Uint8Array(data),
    cMapUrl: res('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: res('standard_fonts'),
    wasmUrl: res('wasm'),
    iccUrl: res('iccs'),
  })
  const doc = await task.promise
  const ctx = document.createElement('canvas').getContext('2d')
  const measure: Measure = (text, fam) => {
    if (!ctx) return 0
    ctx.font = `100px ${fam}`
    return ctx.measureText(text).width
  }
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const base = page.getViewport({ scale: 1 })
      const scale = MAX_SIDE / Math.max(base.width, base.height)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      try {
        // intent 'print': pdf.js non aspetta requestAnimationFrame, così l'import continua anche
        // se si cambia app o lo schermo si spegne (con 'display' resterebbe fermo fino al ritorno).
        await page.render({ canvas, viewport, background: '#ffffff', intent: 'print' }).promise
        const image = await canvasToBlob(canvas)
        const thumb = await makeThumb(canvas, canvas.width, canvas.height)
        // Un PDF scansionato non ha testo: si va avanti senza (l'evidenziatore allora raddrizza soltanto).
        const text = await page.getTextContent().catch(() => null)
        const words = text ? wordBoxes(text.items, viewport.transform, canvas.width, canvas.height, measure, text.styles) : []
        await onPage({ image, thumb, width: canvas.width, height: canvas.height, ...(words.length ? { words } : {}) }, i - 1, doc.numPages)
      } finally {
        releaseCanvas(canvas)
        page.cleanup()
      }
    }
    return doc.numPages
  } finally {
    await task.destroy()
  }
}
