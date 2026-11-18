import { db, newId, type Id, type InkPage, type Stroke } from '../../db/schema'

/** Dove si scrive: sopra una slide, oppure su una pagina bianca già esistente. */
export type InkTarget = { slideId: Id } | { pageId: Id }

/** Proporzioni delle pagine bianche: 16:10 come il tablet in orizzontale. */
export const BLANK_W = 1600
export const BLANK_H = 1000

export function findPage(target: InkTarget): Promise<InkPage | undefined> {
  return 'pageId' in target ? db.ink.get(target.pageId) : db.ink.where('slideId').equals(target.slideId).first()
}

/** Aggiunge un tratto; la pagina della slide viene creata al primo tratto. Restituisce l'id della pagina. */
export async function addStroke(lessonId: Id, target: InkTarget, stroke: Stroke): Promise<Id> {
  return db.transaction('rw', db.ink, async () => {
    const page = await findPage(target)
    if (page) {
      await db.ink.update(page.id, { strokes: [...page.strokes, stroke] })
      return page.id
    }
    const id = newId()
    await db.ink.add({ id, lessonId, slideId: 'slideId' in target ? target.slideId : undefined, order: 0, strokes: [stroke] })
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

/** Annulla l'ultimo tratto della pagina. */
export async function undoLast(pageId: Id): Promise<void> {
  await db.transaction('rw', db.ink, async () => {
    const page = await db.ink.get(pageId)
    if (page?.strokes.length) await db.ink.update(pageId, { strokes: page.strokes.slice(0, -1) })
  })
}

/** Pagine bianche della lezione, in ordine. */
export async function blankPages(lessonId: Id): Promise<InkPage[]> {
  const pages = await db.ink.where('lessonId').equals(lessonId).filter((p) => !p.slideId).toArray()
  return pages.sort((a, b) => a.order - b.order)
}

export async function addBlankPage(lessonId: Id): Promise<Id> {
  const pages = await blankPages(lessonId)
  const id = newId()
  await db.ink.add({ id, lessonId, order: (pages.at(-1)?.order ?? -1) + 1, strokes: [] })
  return id
}

export const deletePage = (pageId: Id) => db.ink.delete(pageId)
