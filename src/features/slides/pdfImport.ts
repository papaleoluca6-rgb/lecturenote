// Import PDF con pdf.js (build "legacy": compatibile con il Chrome vecchio del tablet).
// Ogni pagina diventa un'immagine JPEG; si renderizza una pagina alla volta per tenere bassa la memoria.
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { canvasToBlob, releaseCanvas } from '../../lib/image'
import { MAX_SIDE, makeThumb } from './canvas'
import { wordBoxes, type Measure } from './textBoxes'

/** Lato lungo di ripiego se una pagina a MAX_SIDE non entra nella memoria del tablet. */
const FALLBACK_SIDE = 1600

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
): Promise<void> {
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
      try {
        let rendered: RenderedPage
        try {
          rendered = await renderPage(page, MAX_SIDE, measure)
        } catch (err) {
          // Pagina troppo pesante per la memoria del tablet a 3000 px (es. foto enormi nel PDF): si riprova più piccola.
          console.warn(`Pagina ${i}: riprovo a ${FALLBACK_SIDE} px`, err)
          rendered = await renderPage(page, FALLBACK_SIDE, measure)
        }
        // Fuori dal try: un errore del database (lezione eliminata, scrittura fallita) deve fermare l'import, non ripeterlo.
        await onPage(rendered, i - 1, doc.numPages)
      } finally {
        page.cleanup()
      }
    }
  } finally {
    await task.destroy()
  }
}

type PdfPage = Awaited<ReturnType<Awaited<ReturnType<typeof getDocument>['promise']>['getPage']>>

/** Una pagina → JPEG con lato lungo `side`, miniatura e posizione delle parole. */
async function renderPage(page: PdfPage, side: number, measure: Measure): Promise<RenderedPage> {
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: side / Math.max(base.width, base.height) })
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
    return { image, thumb, width: canvas.width, height: canvas.height, ...(words.length ? { words } : {}) }
  } finally {
    releaseCanvas(canvas)
  }
}
