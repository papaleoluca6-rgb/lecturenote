import { db, newId, type Flashcard, type Id, type Sec } from '../../db/schema'

/** Giorni prima di rivedere una carta per ogni scatola di Leitner (0 = subito). */
const DAYS = [0, 1, 3, 7, 16]
/** Una carta sbagliata torna dopo pochi minuti. */
const RETRY_MS = 5 * 60_000

export async function addCards(lessonId: Id, drafts: { front: string; back: string; ts?: Sec }[]): Promise<void> {
  const now = Date.now()
  await db.cards.bulkAdd(drafts.map((d) => ({ id: newId(), lessonId, front: d.front.trim(), back: d.back.trim(), ts: d.ts, box: 0, due: now, createdAt: now })))
}

/** Una carta giusta non torna prima di questo tempo (risposta alle 23:55 → non già a mezzanotte). */
const MIN_GAP_MS = 12 * 3_600_000

/**
 * Quando rivedere una carta. Giusta: dalla mezzanotte locale di oggi + i giorni della scatola
 * ("1 giorno" = domani, non tra 24 ore esatte; setDate regge il cambio dell'ora legale), ma almeno 12 ore dopo.
 * Sbagliata: tra 5 minuti.
 */
export function nextDue(box: number, knew: boolean, now: number): number {
  if (!knew) return now + RETRY_MS
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const days = DAYS[Math.min(Math.max(box, 0), DAYS.length - 1)]
  d.setDate(d.getDate() + days)
  return days ? Math.max(d.getTime(), now + MIN_GAP_MS) : d.getTime()
}

/** Risposta nel ripasso: giusta → scatola dopo, sbagliata → si ricomincia. */
export async function grade(card: Flashcard, knew: boolean): Promise<void> {
  const box = knew ? Math.min(card.box + 1, DAYS.length - 1) : 0
  await db.cards.update(card.id, { box, due: nextDue(box, knew, Date.now()) })
}

export const isDue = (c: Flashcard, now = Date.now()) => c.due <= now

/** Il prossimo momento in cui una carta non ancora da ripassare lo diventa (null se nessuna). */
export function nextDueAt(cards: Flashcard[], now = Date.now()): number | null {
  let next = Infinity
  for (const c of cards) if (c.due > now && c.due < next) next = c.due
  return next === Infinity ? null : next
}
