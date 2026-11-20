import { dropOps } from './toolStore'
import { db, newId, type Id, type InkPage, type Paper, type Stroke, type TextBox } from '../../db/schema'
import { strokeKey } from './strokeKey'

/** Dove si scrive: sopra una slide, oppure su una pagina bianca già esistente. */
export type InkTarget = { slideId: Id } | { pageId: Id }

/** Proporzioni delle pagine bianche: 16:10 come il tablet in orizzontale. */
export const BLANK_W = 1600
export const BLANK_H = 1000

export function findPage(target: InkTarget): Promise<InkPage | undefined> {
  return 'pageId' in target ? db.ink.get(target.pageId) : db.ink.where('slideId').equals(target.slideId).first()
}

/** Aggiunge uno o più tratti; la pagina della slide viene creata al primo tratto. Restituisce l'id della pagina. */
export async function addStroke(lessonId: Id, target: InkTarget, stroke: Stroke | Stroke[]): Promise<Id> {
  const add = Array.isArray(stroke) ? stroke : [stroke]
  return db.transaction('rw', db.ink, async () => {
    const page = await findPage(target)
    if (page) {
      await db.ink.update(page.id, { strokes: [...page.strokes, ...add] })
      return page.id
    }
    const id = newId()
    await db.ink.add({ id, lessonId, slideId: 'slideId' in target ? target.slideId : undefined, order: 0, strokes: add })
    return id
  })
}

/** La pagina esiste ancora? (es. non è stata eliminata insieme alla sua presentazione). */
export const pageExists = (pageId: Id): Promise<boolean> =>
  db.ink.where(':id').equals(pageId).count().then((n) => n > 0)

/**
 * Toglie i tratti indicati (gomma), riconosciuti dal contenuto e non dalla posizione:
 * se nel frattempo la pagina è cambiata (un tratto appena salvato), non si cancella il tratto sbagliato.
 */
export async function removeStrokes(pageId: Id, drop: Set<string>): Promise<Stroke[]> {
  return db.transaction('rw', db.ink, async () => {
    const page = await db.ink.get(pageId)
    if (!page) return []
    const removed = page.strokes.filter((s) => drop.has(strokeKey(s)))
    if (removed.length) await db.ink.update(pageId, { strokes: page.strokes.filter((s) => !drop.has(strokeKey(s))) })
    return removed
  })
}

/** Rimette dei tratti sulla pagina («Annulla» della gomma, «Ripeti» di un tratto), senza doppioni. */
export async function restoreStrokes(pageId: Id, strokes: Stroke[]): Promise<void> {
  await db.transaction('rw', db.ink, async () => {
    const page = await db.ink.get(pageId)
    if (!page) return
    const have = new Set(page.strokes.map(strokeKey))
    await db.ink.update(pageId, { strokes: [...page.strokes, ...strokes.filter((s) => !have.has(strokeKey(s)))] })
  })
}

/** Aggiunge o aggiorna una casella di testo; la pagina della slide viene creata alla prima casella. */
export async function putText(lessonId: Id, target: InkTarget, box: TextBox): Promise<void> {
  await db.transaction('rw', db.ink, async () => {
    const page = await findPage(target)
    if (!page) {
      await db.ink.add({ id: newId(), lessonId, slideId: 'slideId' in target ? target.slideId : undefined, order: 0, strokes: [], texts: [box] })
      return
    }
    const texts = page.texts ?? []
    const i = texts.findIndex((t) => t.id === box.id)
    await db.ink.update(page.id, { texts: i < 0 ? [...texts, box] : texts.map((t, j) => (j === i ? box : t)) })
  })
}

/** Elimina una casella di testo. */
export async function removeText(target: InkTarget, id: Id): Promise<void> {
  await db.transaction('rw', db.ink, async () => {
    const page = await findPage(target)
    if (page?.texts) await db.ink.update(page.id, { texts: page.texts.filter((t) => t.id !== id) })
  })
}

/** Cambia il tipo di foglio di una pagina bianca. */
export const setPaper = (pageId: Id, paper: Paper) => db.ink.update(pageId, { paper })

/** Pagine bianche della lezione, in ordine. */
export async function blankPages(lessonId: Id): Promise<InkPage[]> {
  const pages = await db.ink.where('lessonId').equals(lessonId).filter((p) => !p.slideId).toArray()
  return pages.sort((a, b) => a.order - b.order)
}

/** Nuova pagina bianca, con lo stesso tipo di foglio dell'ultima. */
export async function addBlankPage(lessonId: Id): Promise<Id> {
  const pages = await blankPages(lessonId)
  const id = newId()
  const last = pages.at(-1)
  await db.ink.add({ id, lessonId, order: (last?.order ?? -1) + 1, strokes: [], paper: last?.paper })
  return id
}

/** Elimina la pagina; «Annulla» e «Ripeti» non devono più puntare lì. */
export async function deletePage(pageId: Id): Promise<void> {
  await db.ink.delete(pageId)
  dropOps(new Set([pageId]))
}
