import { db, type Course, type Id, type Lang, type Lesson, type Sec } from '../../db/schema'
import { slideNumbers } from '../../lib/slideNumbers'
import { fmtSecs } from '../../lib/time'

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

interface Ev { ts: Sec; order: number; lines: string[] }

async function lessonText(lesson: Lesson, course: Course | undefined, opts: ExportOptions): Promise<string> {
  const q = { lessonId: lesson.id }
  const [notes, pins, slides, lines, trs, ink, cards] = await Promise.all([
    db.notes.where(q).toArray(), db.pins.where(q).toArray(), db.slides.where(q).toArray(),
    db.transcript.where(q).toArray(), db.translations.where(q).toArray(), db.ink.where(q).toArray(),
    db.cards.where(q).toArray(),
  ])
  const slideById = new Map(slides.map((s) => [s.id, s]))
  const num = slideNumbers(slides)
  const itById = new Map(trs.map((t) => [t.transcriptId, t.text]))
  const evs: Ev[] = []

  for (const n of notes) {
    const text = oneLine(n.text)
    const body = n.photo ? `(foto)${text ? ` ${text}` : ''}` : text
    evs.push({ ts: n.ts, order: 1, lines: [`${stamp(n.ts)} Nota: ${body}`] })
  }
  for (const p of pins) {
    const s = slideById.get(p.slideId)
    if (s) evs.push({ ts: p.ts, order: 0, lines: [`${stamp(p.ts)} Slide ${num.get(s.id)?.n} di ${num.get(s.id)?.of} della presentazione «${s.deckName}»`] })
  }
  for (const l of lines) {
    const it = itById.get(l.id)
    if (it) {
      const out = [`${stamp(l.ts)} ${oneLine(it)}`]
      if (opts.original && l.lang !== 'it') out.push(`    Originale (${ORIGINAL_LABEL[l.lang]}): ${oneLine(l.text)}`)
      evs.push({ ts: l.ts, order: 2, lines: out })
    } else {
      evs.push({ ts: l.ts, order: 2, lines: [`${stamp(l.ts)} ${oneLine(l.text)}`] })
    }
  }
  for (const page of ink) {
    if (!page.strokes.length) continue
    const ts = Math.min(...page.strokes.map((s) => s.ts))
    evs.push({ ts, order: 3, lines: [`${stamp(ts)} Pagina scritta a mano (non inclusa nel testo)`] })
  }
  evs.sort((a, b) => a.ts - b.ts || a.order - b.order)

  const title = `${course?.name ?? 'Corso'} — ${lesson.title}`
  const out = [`# ${title}`, '', `Data: ${dateLong(lesson.date)} · Durata: ${fmtSecs(lesson.durationSec)} · Lingua del docente: ${SPOKEN[lesson.spokenLang] ?? lesson.spokenLang}`, '']
  if (lesson.aiSummary?.trim()) out.push('## Riassunto', '', lesson.aiSummary.trim(), '')
  out.push('## Lezione minuto per minuto', '')
  out.push(...(evs.length ? evs.flatMap((e) => e.lines) : ['(Nessuna nota, slide o frase registrata.)']), '')
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
  const bodies = await Promise.all(src.lessons.map((l) => lessonText(l, course, opts)))
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
