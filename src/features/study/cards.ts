import { db, newId, type Flashcard, type Id, type Sec } from '../../db/schema'

/** Giorni prima di rivedere una carta per ogni scatola di Leitner (0 = subito). */
const DAYS = [0, 1, 3, 7, 16]
const DAY = 86_400_000
/** Una carta sbagliata torna dopo pochi minuti. */
const RETRY_MS = 5 * 60_000

export async function addCards(lessonId: Id, drafts: { front: string; back: string; ts?: Sec }[]): Promise<void> {
  const now = Date.now()
  await db.cards.bulkAdd(drafts.map((d) => ({ id: newId(), lessonId, front: d.front.trim(), back: d.back.trim(), ts: d.ts, box: 0, due: now, createdAt: now })))
}

/** Risposta nel ripasso: giusta → scatola dopo, sbagliata → si ricomincia. */
export async function grade(card: Flashcard, knew: boolean): Promise<void> {
  const box = knew ? Math.min(card.box + 1, DAYS.length - 1) : 0
  const due = Date.now() + (knew ? DAYS[box] * DAY : RETRY_MS)
  await db.cards.update(card.id, { box, due })
}

export const isDue = (c: Flashcard, now = Date.now()) => c.due <= now
