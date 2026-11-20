import { db, lessonTables, newId, type AudioSegment, type Note, type Slide, type SlidePin, type TranscriptSegment } from '../../db/schema'
import { detectLang } from '../../lib/detectLang'

// Import delle lezioni esportate dalla vecchia app (legacy/lecturenote*.html, «Esporta JSON»).
// Audio e immagini arrivano in base64: si convertono in Blob, come vuole il nuovo database.

interface LegacySession {
  id: string
  title: string
  course?: string
  date?: string
  duration?: number
  paragraphs?: { ts: number; text: string }[]
  annotations?: { ts: number; text?: string; photoDataUrl?: string | null }[]
  pinnedSlides?: { slideIdx: number; ts: number }[]
  slides?: { dataUrl: string; name?: string }[]
  aiSummary?: string | null
  audioB64?: string | null
  audioMime?: string | null
  previousAudioB64?: string | null
  previousAudioMime?: string | null
}

const toBlob = async (b64: string, mime = 'application/octet-stream') =>
  (await fetch(b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`)).blob()

/** Durata di un file audio (i webm di MediaRecorder dichiarano «Infinity»: si chiede di andare in fondo). */
function audioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio()
    const url = URL.createObjectURL(blob)
    const done = (d: number) => { clearTimeout(timer); URL.revokeObjectURL(url); resolve(Number.isFinite(d) ? d : 0) }
    const timer = setTimeout(() => done(0), 15_000)
    a.preload = 'metadata'
    a.onloadedmetadata = () => {
      if (Number.isFinite(a.duration)) return done(a.duration)
      a.ontimeupdate = () => { a.ontimeupdate = null; done(a.duration) }
      a.currentTime = 1e7
    }
    a.onerror = () => done(0)
    a.src = url
  })
}

interface LegacyAudio { blob: Blob; dur: number }

/** Audio base64 → Blob con la sua durata (0 se non si riesce a misurarla). */
async function readAudio(b64: string, mime?: string | null): Promise<LegacyAudio> {
  const blob = await toBlob(b64, mime ?? 'audio/webm')
  return { blob, dur: await audioDuration(blob) }
}

async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(blob)
  const size = { width: bmp.width, height: bmp.height }
  bmp.close()
  return size
}

function parse(text: string, name: string): LegacySession {
  let s: LegacySession
  try { s = JSON.parse(text) } catch { throw new Error(`«${name}» non è un file JSON valido.`) }
  if (!s || typeof s.id !== 'string' || typeof s.title !== 'string') throw new Error(`«${name}» non è una lezione della vecchia app.`)
  return s
}

/** Importa una lezione; reimportare lo stesso file la sostituisce invece di duplicarla. */
/** Importa un file; restituisce il titolo, oppure null se la lezione era già stata importata. */
async function importOne(file: File): Promise<string | null> {
  const s = parse(await file.text(), file.name)
  const lessonId = `legacy-${s.id}`
  // Già importata: non si riscrive, altrimenti si perderebbe quello che è stato aggiunto dopo (penna, flashcard, traduzioni).
  if (await db.lessons.get(lessonId)) return null
  const date = Date.parse(s.date ?? '') || file.lastModified || Date.now()

  // Nella vecchia app, continuando una lezione, l'audio nuovo parte dal punto in cui si era fermata (prev.duration)
  // e arriva a s.duration; previousAudio è solo la sessione prima dell'ultima (quelle ancora prima sono perse)
  // e finisce dove inizia l'audio corrente. Senza audio nuovo, i due sono lo stesso file.
  const cur = s.audioB64 ? await readAudio(s.audioB64, s.audioMime) : null
  const prev = s.previousAudioB64 && s.previousAudioB64 !== s.audioB64 ? await readAudio(s.previousAudioB64, s.previousAudioMime) : null
  const total = s.duration ?? 0
  const curDur = cur ? cur.dur || Math.max(0, total - (prev?.dur ?? 0)) : 0
  let curStart = Math.max(0, total - curDur)
  // Durata della lezione mancante o incoerente: i due audio uno dopo l'altro.
  if (prev && !curStart) curStart = prev.dur
  const audio: AudioSegment[] = []
  const add = (p: LegacyAudio, startSec: number, durationSec: number) =>
    audio.push({ id: newId(), lessonId, index: audio.length, startSec, durationSec, mime: p.blob.type, blob: p.blob })
  if (prev) {
    const dur = Math.min(prev.dur || curStart, curStart)
    add(prev, curStart - dur, dur)
  }
  if (cur) add(cur, curStart, curDur)

  const slides: Slide[] = []
  /** Indice nella vecchia lezione → slide importata (le immagini rovinate mancano). */
  const byIdx = new Map<number, Slide>()
  for (const [i, sl] of (s.slides ?? []).entries()) {
    if (!sl?.dataUrl) continue
    const image = await toBlob(sl.dataUrl)
    // Un'immagine rovinata si salta: non deve far perdere il resto della lezione.
    const size = await imageSize(image).catch(() => null)
    if (!size) continue
    const slide: Slide = { id: newId(), lessonId, deckName: (sl.name ?? 'Slide').split(' — ')[0], page: i + 1, image, ...size }
    slides.push(slide)
    byIdx.set(i, slide)
  }
  const pins: SlidePin[] = (s.pinnedSlides ?? [])
    .filter((p) => byIdx.has(p.slideIdx))
    .map((p) => ({ id: newId(), lessonId, slideId: byIdx.get(p.slideIdx)!.id, ts: p.ts }))

  const notes: Note[] = []
  for (const a of s.annotations ?? []) {
    const photo = a.photoDataUrl ? await toBlob(a.photoDataUrl) : undefined
    notes.push({ id: newId(), lessonId, ts: a.ts ?? 0, text: (a.text ?? '').replace('📷 Foto', '').trim(), photo, createdAt: date })
  }
  const lines: TranscriptSegment[] = (s.paragraphs ?? [])
    .filter((p) => p.text?.trim())
    .map((p) => ({ id: newId(), lessonId, ts: p.ts ?? 0, lang: detectLang(p.text), text: p.text.trim(), source: 'ai' }))

  const duration = Math.max(total, ...audio.map((a) => a.startSec + a.durationSec))
  const courseName = (s.course ?? '').trim() || 'Lezioni importate'
  const children = lessonTables()

  await db.transaction('rw', [db.courses, db.lessons, ...children], async () => {
    const course = (await db.courses.toArray()).find((c) => c.name.toLowerCase() === courseName.toLowerCase())
    const courseId = course?.id ?? newId()
    if (!course) await db.courses.add({ id: courseId, name: courseName, color: 'var(--accent)', createdAt: Date.now() })
    for (const t of children) await t.where('lessonId').equals(lessonId).delete()
    await db.lessons.put({
      id: lessonId, courseId, title: s.title, date, durationSec: duration, createdAt: date, updatedAt: Date.now(),
      spokenLang: 'zh+en', ...(s.aiSummary ? { aiSummary: s.aiSummary } : {}),
    })
    await db.audio.bulkAdd(audio)
    await db.slides.bulkAdd(slides)
    await db.pins.bulkAdd(pins)
    await db.notes.bulkAdd(notes)
    await db.transcript.bulkAdd(lines)
  })
  return s.title
}

/** Importa più file; un file rovinato non blocca gli altri. */
export async function importLegacy(files: File[], onProgress: (msg: string) => void): Promise<string> {
  const ok: string[] = []
  const skipped: string[] = []
  const errors: string[] = []
  for (const [i, f] of files.entries()) {
    onProgress(`Importo «${f.name}» (${i + 1}/${files.length})…`)
    try {
      const title = await importOne(f)
      if (title === null) skipped.push(f.name)
      else ok.push(title)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  return [
    ok.length && `Importate ${ok.length} lezioni: ${ok.join(', ')}.`,
    skipped.length && `Già importate, lasciate com'erano: ${skipped.join(', ')}.`,
    ...errors,
  ].filter(Boolean).join(' ')
}
