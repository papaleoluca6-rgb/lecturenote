import { db, type Id, type Sec } from '../../db/schema'

export type EventKind = 'note' | 'slide' | 'phrase' | 'ink'

/** Un momento della lezione da cui si può riascoltare. */
export interface LessonEvent {
  key: string
  kind: EventKind
  ts: Sec
  title: string
  text?: string
  /** Testo originale di una frase tradotta. */
  original?: string
  image?: Blob
}

/** Note, slide mostrate, frasi trascritte e pagine a penna, in ordine di tempo. */
export async function loadTimeline(lessonId: Id): Promise<LessonEvent[]> {
  const q = { lessonId }
  const [notes, pins, slides, lines, trs, ink] = await Promise.all([
    db.notes.where(q).toArray(), db.pins.where(q).toArray(), db.slides.where(q).toArray(),
    db.transcript.where(q).toArray(), db.translations.where(q).toArray(), db.ink.where(q).toArray(),
  ])
  const slideById = new Map(slides.map((s) => [s.id, s]))
  const trById = new Map(trs.map((t) => [t.transcriptId, t.text]))
  const events: LessonEvent[] = []

  for (const n of notes) events.push({ key: n.id, kind: 'note', ts: n.ts, title: n.photo ? 'Foto' : 'Nota', text: n.text, image: n.photo })
  for (const p of pins) {
    const s = slideById.get(p.slideId)
    if (s) events.push({ key: p.id, kind: 'slide', ts: p.ts, title: `Slide ${s.page} · ${s.deckName}`, image: s.thumb ?? s.image })
  }
  for (const l of lines) {
    const it = trById.get(l.id)
    events.push({ key: l.id, kind: 'phrase', ts: l.ts, title: 'Frase', text: it ?? l.text, original: it ? l.text : undefined })
  }
  for (const page of ink) {
    if (!page.strokes.length) continue
    const ts = Math.min(...page.strokes.map((s) => s.ts))
    const s = page.slideId ? slideById.get(page.slideId) : undefined
    events.push({ key: page.id, kind: 'ink', ts, title: s ? `Scritto sulla slide ${s.page}` : `Pagina a penna ${page.order + 1}` })
  }
  return events.sort((a, b) => a.ts - b.ts)
}

/** Testo della lezione per il riassunto e le flashcard AI: frasi (in italiano se tradotte) e note, con il tempo. */
export function lessonText(events: LessonEvent[], maxChars = 60_000): string {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const lines = events
    .filter((e) => e.text && (e.kind === 'phrase' || e.kind === 'note'))
    .map((e) => `[${fmt(e.ts)}]${e.kind === 'note' ? ' (nota dello studente)' : ''} ${e.text}`)
  return lines.join('\n').slice(0, maxChars)
}
