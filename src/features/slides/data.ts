import { db, newId, type Id, type Sec, type Slide } from '../../db/schema'
import { renderImage } from './imageImport'
import type { RenderedPage } from './pdfImport'

export type Progress = (msg: string) => void

async function nextPage(lessonId: Id): Promise<number> {
  const last = await db.slides.where('[lessonId+page]').between([lessonId, -Infinity], [lessonId, Infinity]).last()
  return last ? last.page + 1 : 0
}

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)

/** La lezione è stata eliminata durante l'import (l'utente è uscito da una lezione vuota). */
class LessonGone extends Error {}

/** Pagine scritte insieme: poche per non tenere troppe immagini in memoria, abbastanza per non rileggere il deck a ogni pagina. */
const BATCH = 8

/** Importa PDF e immagini in coda alle slide della lezione. Restituisce l'id della prima slide importata. */
export async function importFiles(lessonId: Id, files: File[], progress: Progress): Promise<Id | undefined> {
  let page = await nextPage(lessonId)
  const saved: Id[] = []
  let pending: Slide[] = []
  const flush = async () => {
    if (!pending.length) return
    const batch = pending
    pending = []
    await db.transaction('rw', db.lessons, db.slides, async () => {
      if (!(await db.lessons.get(lessonId))) throw new LessonGone()
      await db.slides.bulkAdd(batch)
    })
    saved.push(...batch.map((s) => s.id))
  }
  const save = async (deckName: string, r: RenderedPage) => {
    pending.push({ id: newId(), lessonId, deckName, page: page++, ...r })
    if (pending.length >= BATCH) await flush()
  }
  try {
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
    await flush()
  } catch (err) {
    // Niente mazzi a metà: si toglie quanto già scritto da questo import (riprovare non crea doppioni).
    await db.transaction('rw', db.slides, db.pins, db.ink, async () => {
      await db.pins.where('lessonId').equals(lessonId).filter((p) => saved.includes(p.slideId)).delete()
      await db.ink.where('slideId').anyOf(saved).delete()
      await db.slides.bulkDelete(saved)
    })
    if (err instanceof LessonGone) return undefined
    throw err
  }
  return saved[0]
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
