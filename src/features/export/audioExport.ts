import { db, type AudioSegment, type Course, type Lesson } from '../../db/schema'
import { audioPlan, convertAudio, type AudioPlan } from './convertAudio'
import { lessonFileBase, safeName, type ExportFile } from './notebooklm'

export interface AudioExportOptions {
  signal?: AbortSignal
  /** Avanzamento complessivo da 0 a 1. */
  onProgress?: (fraction: number) => void
  forceWav?: boolean
  maxBytes?: number
}

const isWebmMime = (mime: string) => /webm/.test(mime)

async function segments(lessons: Lesson[]): Promise<{ lesson: Lesson; segs: AudioSegment[] }[]> {
  return Promise.all(lessons.map(async (lesson) => ({
    lesson,
    segs: (await db.audio.where({ lessonId: lesson.id }).toArray()).sort((a, b) => a.index - b.index),
  })))
}

/** Audio delle lezioni convertito in formati che NotebookLM accetta, un file per segmento (o parte). */
export async function audioFiles(lessons: Lesson[], course: Course | undefined, opts: AudioExportOptions = {}): Promise<ExportFile[]> {
  const all = await segments(lessons)
  const total = all.reduce((n, l) => n + l.segs.reduce((m, s) => m + s.blob.size, 0), 0) || 1
  let done = 0
  const out: ExportFile[] = []
  for (const { lesson, segs } of all) {
    for (const s of segs) {
      const r = await convertAudio(s.blob, s.mime, {
        signal: opts.signal,
        forceWav: opts.forceWav,
        maxBytes: opts.maxBytes,
        onProgress: (b) => opts.onProgress?.((done + b) / total),
      })
      done += s.blob.size
      const base = `${lessonFileBase(lesson, course)} - audio ${s.index + 1}`
      r.blobs.forEach((blob, i) => {
        const name = `${safeName(r.blobs.length > 1 ? `${base} (parte ${i + 1})` : base)}.${r.ext}`
        out.push({ name, file: new File([blob], name, { type: r.mime }) })
      })
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
