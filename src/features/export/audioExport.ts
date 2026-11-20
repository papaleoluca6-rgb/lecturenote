import { db, type AudioSegment, type Course, type Lesson } from '../../db/schema'
import { audioPlan, convertAudio, convertWebmLesson, type AudioPlan, type ConvertedAudio } from './convertAudio'
import { isWebm } from './webm'
import { lessonFileBase, safeName, type ExportFile } from './notebooklm'

export interface AudioExportOptions {
  signal?: AbortSignal
  /** Avanzamento complessivo da 0 a 1. */
  onProgress?: (fraction: number) => void
}

const isWebmMime = (mime: string) => /webm/.test(mime)

async function segments(lessons: Lesson[]): Promise<{ lesson: Lesson; segs: AudioSegment[] }[]> {
  return Promise.all(lessons.map(async (lesson) => ({
    lesson,
    segs: (await db.audio.where({ lessonId: lesson.id }).toArray()).sort((a, b) => a.index - b.index),
  })))
}

/** Audio delle lezioni convertito in formati che NotebookLM accetta: un file per lezione (o per segmento, se non sono tutti WebM). */
export async function audioFiles(lessons: Lesson[], course: Course | undefined, opts: AudioExportOptions = {}): Promise<ExportFile[]> {
  const all = await segments(lessons)
  const total = all.reduce((n, l) => n + l.segs.reduce((m, s) => m + s.blob.size, 0), 0) || 1
  let done = 0
  const out: ExportFile[] = []
  const push = (r: ConvertedAudio, base: string) =>
    r.blobs.forEach((blob, i) => {
      const name = `${safeName(r.blobs.length > 1 ? `${base} (parte ${i + 1})` : base)}.${r.ext}`
      out.push({ name, file: new File([blob], name, { type: r.mime }) })
    })
  for (const { lesson, segs } of all) {
    // Registrazioni dell'app (WebM, un segmento ogni 5 minuti): tutti in un solo file per lezione.
    if (segs.length > 1 && (await Promise.all(segs.map((s) => isWebm(s.blob)))).every(Boolean)) {
      const start = done
      const r = await convertWebmLesson(segs.map((s) => s.blob), {
        signal: opts.signal,
        onProgress: (b) => opts.onProgress?.((start + b) / total),
      })
      done += segs.reduce((m, s) => m + s.blob.size, 0)
      push(r, `${lessonFileBase(lesson, course)} - audio`)
      continue
    }
    for (const s of segs) {
      const r = await convertAudio(s.blob, s.mime, {
        signal: opts.signal,
        onProgress: (b) => opts.onProgress?.((done + b) / total),
      })
      done += s.blob.size
      push(r, `${lessonFileBase(lesson, course)} - audio ${s.index + 1}`)
    }
  }
  return out
}

export interface AudioEstimate {
  bytes: number
  format: AudioPlan['format']
  /** True se c'è almeno un segmento webm da convertire. */
  needsConversion: boolean
}

/** Dimensione stimata dei file audio dopo la conversione, dalla durata della lezione. */
export async function audioEstimate(lessons: Lesson[]): Promise<AudioEstimate> {
  const [all, plan] = await Promise.all([segments(lessons), audioPlan()])
  let bytes = 0
  let needsConversion = false
  for (const { segs } of all) {
    for (const s of segs) {
      if (!isWebmMime(s.mime)) {
        bytes += s.blob.size
        continue
      }
      needsConversion = true
      // Se la durata manca (registrazione interrotta), la si ricava dai 64 kbps del registratore.
      const sec = s.durationSec > 0 ? s.durationSec : s.blob.size / 8000
      bytes += (sec / 60) * plan.bytesPerMin
    }
  }
  return { bytes, format: plan.format, needsConversion }
}
