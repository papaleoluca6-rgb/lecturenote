import { db, newId, type Id, type Sec, type Slide } from '../../db/schema'
import { renderImage } from './imageImport'
import type { RenderedPage } from './pdfImport'

export type Progress = (msg: string) => void

async function nextPage(lessonId: Id): Promise<number> {
  const last = await db.slides.where('[lessonId+page]').between([lessonId, -Infinity], [lessonId, Infinity]).last()
  return last ? last.page + 1 : 0
}

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)

/** Importa PDF e immagini in coda alle slide della lezione. Restituisce l'id della prima slide importata. */
export async function importFiles(lessonId: Id, files: File[], progress: Progress): Promise<Id | undefined> {
  let page = await nextPage(lessonId)
  let first: Id | undefined
  const save = async (deckName: string, r: RenderedPage) => {
    const id = newId()
    first ??= id
    await db.slides.add({ id, lessonId, deckName, page: page++, ...r })
  }
  for (const f of files) {
    const deck = f.name.replace(/\.[^.]+$/, '')
    if (isPdf(f)) {
      progress(`Apro ${f.name}…`)
      // pdf.js è pesante: si carica solo al primo import, non all'avvio dell'app.
      const { renderPdf } = await import('./pdfImport')
      await renderPdf(await f.arrayBuffer(), async (r, i, total) => {
        progress(`${f.name}: pagina ${i + 1} di ${total}`)
        await save(deck, r)
      })
    } else if (f.type.startsWith('image/')) {
      progress(`Importo ${f.name}…`)
      await save(deck, await renderImage(f))
    }
  }
  return first
}

/** Elimina tutte le slide di una presentazione, i loro agganci al tempo e gli appunti a penna scritti sopra. */
export async function deleteDeck(lessonId: Id, deckName: string): Promise<void> {
  await db.transaction('rw', db.slides, db.pins, db.ink, async () => {
    const ids = (await db.slides.where('lessonId').equals(lessonId).filter((s) => s.deckName === deckName).primaryKeys()) as Id[]
    await db.pins.where('lessonId').equals(lessonId).filter((p) => ids.includes(p.slideId)).delete()
    await db.ink.where('slideId').anyOf(ids).delete()
    await db.slides.bulkDelete(ids)
  })
}

export const listSlides = (lessonId: Id): Promise<Slide[]> =>
  db.slides.where('[lessonId+page]').between([lessonId, -Infinity], [lessonId, Infinity]).toArray()

/** Primo momento in cui ogni slide è stata mostrata durante la registrazione. */
export async function firstShown(lessonId: Id): Promise<Map<Id, Sec>> {
  const pins = await db.pins.where('lessonId').equals(lessonId).sortBy('ts')
  const m = new Map<Id, Sec>()
  for (const p of pins) if (!m.has(p.slideId)) m.set(p.slideId, p.ts)
  return m
}

/** Aggiunge un SlidePin, tranne se l'ultimo aggancio è già sulla stessa slide. */
export async function addPin(lessonId: Id, slideId: Id, ts: Sec): Promise<void> {
  await db.transaction('rw', db.pins, async () => {
    const pins = await db.pins.where('lessonId').equals(lessonId).sortBy('ts')
    const last = pins.filter((p) => p.ts <= ts).pop()
    if (last?.slideId === slideId) return
    await db.pins.add({ id: newId(), lessonId, slideId, ts })
  })
}
