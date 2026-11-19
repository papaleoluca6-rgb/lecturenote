import { db, type Id, type InkPage, type Note, type Sec, type Slide, type SlidePin, type TextBox, type TranscriptSegment } from '../db/schema'
import { slideNumbers } from './slideNumbers'

// Tutti i momenti di una lezione in un solo posto: il ripasso e l'export li formattano ciascuno a modo suo.

/** Numero della slide nella sua presentazione e quante pagine ha. */
export interface SlideNum { n: number; of: number }

export type TimelineEvent =
  | { kind: 'slide'; ts: Sec; pin: SlidePin; slide: Slide; num?: SlideNum }
  | { kind: 'note'; ts: Sec; note: Note }
  | { kind: 'phrase'; ts: Sec; line: TranscriptSegment; /** Traduzione italiana, se c'è. */ it?: string }
  | { kind: 'ink'; ts: Sec; page: InkPage; slide?: Slide; num?: SlideNum }
  | { kind: 'text'; ts: Sec; box: TextBox; page: InkPage; slide?: Slide; num?: SlideNum }

/** A parità di tempo: slide, note, frasi, penna, testo scritto. */
const ORDER: Record<TimelineEvent['kind'], number> = { slide: 0, note: 1, phrase: 2, ink: 3, text: 4 }

/** Slide mostrate, note, frasi (con traduzione), pagine a penna e caselle di testo, in ordine di tempo. */
export async function loadLessonEvents(lessonId: Id): Promise<TimelineEvent[]> {
  const q = { lessonId }
  const [notes, pins, slides, lines, trs, ink] = await Promise.all([
    db.notes.where(q).toArray(), db.pins.where(q).toArray(), db.slides.where(q).toArray(),
    db.transcript.where(q).toArray(), db.translations.where(q).toArray(), db.ink.where(q).toArray(),
  ])
  const slideById = new Map(slides.map((s) => [s.id, s]))
  const num = slideNumbers(slides)
  const itById = new Map(trs.map((t) => [t.transcriptId, t.text]))
  const evs: TimelineEvent[] = []

  for (const note of notes) evs.push({ kind: 'note', ts: note.ts, note })
  for (const pin of pins) {
    const slide = slideById.get(pin.slideId)
    if (slide) evs.push({ kind: 'slide', ts: pin.ts, pin, slide, num: num.get(slide.id) })
  }
  for (const line of lines) evs.push({ kind: 'phrase', ts: line.ts, line, it: itById.get(line.id) })
  for (const page of ink) {
    const slide = page.slideId ? slideById.get(page.slideId) : undefined
    const where = { page, slide, num: slide && num.get(slide.id) }
    if (page.strokes.length) evs.push({ kind: 'ink', ts: Math.min(...page.strokes.map((s) => s.ts)), ...where })
    for (const box of page.texts ?? []) if (box.text.trim()) evs.push({ kind: 'text', ts: box.ts, box, ...where })
  }
  return evs.sort((a, b) => a.ts - b.ts || ORDER[a.kind] - ORDER[b.kind])
}
