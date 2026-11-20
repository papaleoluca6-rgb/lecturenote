import { db, type Course, type Id, type Lang, type Lesson, type Sec } from '../../db/schema'
import { fmtSecs } from '../../lib/time'
import { loadLessonEvents, type TimelineEvent } from '../../lib/timeline'

export type ExportTarget = { courseId: Id } | { lessonId: Id }

export interface ExportOptions {
  /** Aggiunge sotto ogni frase tradotta il testo originale. */
  original: boolean
}

export interface ExportFile {
  name: string
  file: File
}

const SPOKEN: Record<string, string> = { it: 'italiano', en: 'inglese', zh: 'cinese', 'zh+en': 'cinese e inglese' }
const ORIGINAL_LABEL: Record<Lang, string> = { zh: '中文', en: 'English', it: 'Italiano' }

/** Toglie i caratteri che Android non accetta nei nomi dei file. */
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'LectureNote'

const dateLong = (ms: number) => new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
const dateShort = (ms: number) => new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '')
const stamp = (ts: Sec) => `[${fmtSecs(ts)}]`
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim()

/** Righe dell'export per un momento della lezione. */
function evLines(e: TimelineEvent, opts: ExportOptions): string[] {
  switch (e.kind) {
    case 'note': {
      const text = oneLine(e.note.text)
      return [`${stamp(e.ts)} Nota: ${e.note.photo ? `(foto)${text ? ` ${text}` : ''}` : text}`]
    }
    case 'slide': return [`${stamp(e.ts)} Slide ${e.num?.n} di ${e.num?.of} della presentazione «${e.slide.deckName}»`]
    case 'phrase': {
      if (!e.it) return [`${stamp(e.ts)} ${oneLine(e.line.text)}`]
      const out = [`${stamp(e.ts)} ${oneLine(e.it)}`]
      if (opts.original && e.line.lang !== 'it') out.push(`    Originale (${ORIGINAL_LABEL[e.line.lang]}): ${oneLine(e.line.text)}`)
      return out
    }
    case 'ink': return [`${stamp(e.ts)} Pagina scritta a mano (non inclusa nel testo)`]
    case 'text': return [`${stamp(e.ts)} Testo scritto${e.slide ? ` sulla slide ${e.num?.n}` : ''}: ${oneLine(e.box.text)}`]
  }
}

async function lessonText(lesson: Lesson, course: Course | undefined, opts: ExportOptions): Promise<string> {
  const [evs, cards] = await Promise.all([loadLessonEvents(lesson.id), db.cards.where({ lessonId: lesson.id }).toArray()])

  const title = `${course?.name ?? 'Corso'} — ${lesson.title}`
  const out = [`# ${title}`, '', `Data: ${dateLong(lesson.date)} · Durata: ${fmtSecs(lesson.durationSec)} · Lingua del docente: ${SPOKEN[lesson.spokenLang] ?? lesson.spokenLang}`, '']
  if (lesson.aiSummary?.trim()) out.push('## Riassunto', '', lesson.aiSummary.trim(), '')
  out.push('## Lezione minuto per minuto', '')
  out.push(...(evs.length ? evs.flatMap((e) => evLines(e, opts)) : ['(Nessuna nota, slide o frase registrata.)']), '')
  if (cards.length) {
    out.push('## Flashcard', '')
    for (const c of cards.sort((a, b) => a.createdAt - b.createdAt)) out.push(`D: ${oneLine(c.front)}`, `R: ${oneLine(c.back)}`, '')
  }
  return out.join('\n')
}

const INTRO = 'Questo file viene da LectureNote. I tempi tra parentesi quadre [mm:ss] si riferiscono all\'audio della lezione.'

export interface ExportSource { kind: 'lesson' | 'course'; title: string; lessons: Lesson[]; course?: Course }

/** Corso o lezione da esportare, con le lezioni in ordine di data. */
export async function loadSource(target: ExportTarget): Promise<ExportSource | null> {
  if ('lessonId' in target) {
    const lesson = await db.lessons.get(target.lessonId)
    if (!lesson) return null
    const course = await db.courses.get(lesson.courseId)
    return { kind: 'lesson', title: lesson.title, lessons: [lesson], course }
  }
  const course = await db.courses.get(target.courseId)
  if (!course) return null
  const lessons = (await db.lessons.where({ courseId: course.id }).toArray()).sort((a, b) => a.date - b.date)
  return { kind: 'course', title: course.name, lessons, course }
}

export async function buildText(src: ExportSource, opts: ExportOptions): Promise<string> {
  const course = src.course
  // Una lezione alla volta: le pagine a penna hanno tutti i tratti, un corso intero insieme non sta nei 3 GB del tablet.
  const bodies: string[] = []
  for (const l of src.lessons) bodies.push(await lessonText(l, course, opts))
  if (src.kind === 'lesson') return `${INTRO}\n\n${bodies[0]}`
  const head = [`# Corso: ${src.title}`, '', INTRO, '', `Lezioni (${src.lessons.length}):`, ...src.lessons.map((l) => `- ${dateShort(l.date)} · ${l.title}`), '']
  return `${head.join('\n')}\n---\n\n${bodies.join('\n---\n\n')}`
}

export const lessonFileBase = (l: Lesson, course?: Course) =>
  safeName(course ? `${course.name} - ${l.title}` : l.title)

/** File di testo (uno per lezione, oppure uno per tutto il corso). */
export async function textFile(src: ExportSource, opts: ExportOptions): Promise<ExportFile> {
  const name = src.kind === 'lesson'
    ? `${lessonFileBase(src.lessons[0], src.course)}.txt`
    : `${safeName(`${src.title} - corso completo`)}.txt`
  const text = await buildText(src, opts)
  return { name, file: new File([text], name, { type: 'text/plain' }) }
}
