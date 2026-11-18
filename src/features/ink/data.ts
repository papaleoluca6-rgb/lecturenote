import { getTool, setTool } from './toolStore'
import { db, newId, type Id, type InkPage, type Paper, type Stroke } from '../../db/schema'

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

/** Toglie i tratti indicati (gomma). */
export async function removeStrokes(pageId: Id, drop: Set<number>): Promise<void> {
  await db.transaction('rw', db.ink, async () => {
    const page = await db.ink.get(pageId)
    if (page) await db.ink.update(pageId, { strokes: page.strokes.filter((_, i) => !drop.has(i)) })
  })
}

/** Annulla l'ultimo tratto della pagina e lo restituisce (per «Ripeti»). */
export async function undoLast(pageId: Id): Promise<Stroke | undefined> {
  return db.transaction('rw', db.ink, async () => {
    const page = await db.ink.get(pageId)
    if (!page?.strokes.length) return undefined
    await db.ink.update(pageId, { strokes: page.strokes.slice(0, -1) })
    return page.strokes.at(-1)
  })
}

/** Rimette un tratto tolto con «Annulla». */
export async function redoStroke(pageId: Id, stroke: Stroke): Promise<void> {
  await db.transaction('rw', db.ink, async () => {
    const page = await db.ink.get(pageId)
    if (page) await db.ink.update(pageId, { strokes: [...page.strokes, stroke] })
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
  const t = getTool()
  setTool({ lastPageId: t.lastPageId === pageId ? undefined : t.lastPageId, redo: t.redo.filter((r) => r.pageId !== pageId) })
}
