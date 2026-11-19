import { type Id, type Sec } from '../../db/schema'
import { fmtSecs } from '../../lib/time'
import { loadLessonEvents, type TimelineEvent } from '../../lib/timeline'

// Le caselle di testo usano il tipo 'ink' (filtro "Penna" della timeline): sono scritti dello studente sulla pagina.
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

function toEvent(e: TimelineEvent): LessonEvent {
  switch (e.kind) {
    case 'note': return { key: e.note.id, kind: 'note', ts: e.ts, title: e.note.photo ? 'Foto' : 'Nota', text: e.note.text, image: e.note.photo }
    case 'slide': return { key: e.pin.id, kind: 'slide', ts: e.ts, title: `Slide ${e.num?.n ?? ''} · ${e.slide.deckName}`, image: e.slide.thumb ?? e.slide.image }
    case 'phrase': return { key: e.line.id, kind: 'phrase', ts: e.ts, title: 'Frase', text: e.it ?? e.line.text, original: e.it ? e.line.text : undefined }
    case 'ink': return { key: e.page.id, kind: 'ink', ts: e.ts, title: e.slide ? `Scritto sulla slide ${e.num?.n ?? ''}` : `Pagina a penna ${e.page.order + 1}` }
    case 'text': return {
      key: e.box.id, kind: 'ink', ts: e.ts, text: e.box.text,
      title: e.slide ? `Testo scritto sulla slide ${e.num?.n ?? ''}` : `Testo scritto · pagina ${e.page.order + 1}`,
    }
  }
}

/** Note, slide mostrate, frasi trascritte, pagine a penna e testo scritto, in ordine di tempo. */
export const loadTimeline = async (lessonId: Id): Promise<LessonEvent[]> => (await loadLessonEvents(lessonId)).map(toEvent)

const CUT = '[Testo interrotto qui: la lezione continua oltre '

/** Testo della lezione per il riassunto e le flashcard AI: frasi (in italiano se tradotte), note e testo scritto, con il tempo. */
export function lessonText(events: LessonEvent[], maxChars = 200_000): string {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const out: string[] = []
  let len = 0
  for (const e of events) {
    if (!e.text || e.kind === 'slide') continue
    const who = e.kind === 'note' ? ' (nota dello studente)' : e.kind === 'ink' ? ' (scritto dallo studente)' : ''
    const line = `[${fmt(e.ts)}]${who} ${e.text}`
    if (len + line.length > maxChars) { out.push(`${CUT}${fmtSecs(e.ts)}]`); break }
    out.push(line)
    len += line.length + 1
  }
  return out.join('\n')
}

/** Se il testo per l'AI è stato tagliato, il minuto (mm:ss) fin dove arriva; altrimenti null. */
export function textCutAt(text: string): string | null {
  const i = text.lastIndexOf(CUT)
  return i < 0 ? null : text.slice(i + CUT.length, -1)
}
