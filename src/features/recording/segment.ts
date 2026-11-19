import { db, newId, type Id, type Sec } from '../../db/schema'

const CHUNK_MS = 5000
/** Ogni quanto il segmento in corso viene salvato su IndexedDB: dopo un crash si perde al massimo questo. */
const SAVE_EVERY_MS = 30_000
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

const pickMime = (): string => MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''

/** Un MediaRecorder = un AudioSegment salvato in db.audio. Pausa e ripresa restano nello stesso segmento. */
export class Segment {
  readonly id: Id = newId()
  private readonly rec: MediaRecorder
  private readonly chunks: Blob[] = []
  private activeMs = 0
  private resumedAt = performance.now()
  private lastSave = performance.now()
  private saving: Promise<void> = Promise.resolve()
  private readonly stopped: Promise<void>

  private readonly lessonId: Id
  readonly index: number
  readonly startSec: Sec
  /** Esito di ogni salvataggio: messaggio d'errore, oppure '' quando riesce. */
  private readonly onSaved: (error: string) => void

  constructor(stream: MediaStream, lessonId: Id, index: number, startSec: Sec, onSaved: (error: string) => void) {
    this.onSaved = onSaved
    this.lessonId = lessonId
    this.index = index
    this.startSec = startSec
    const mimeType = pickMime()
    this.rec = new MediaRecorder(stream, { ...(mimeType && { mimeType }), audioBitsPerSecond: 64_000 })
    this.stopped = new Promise((resolve) => this.rec.addEventListener('stop', () => resolve(), { once: true }))
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data)
      if (performance.now() - this.lastSave >= SAVE_EVERY_MS) this.save()
    }
    this.rec.start(CHUNK_MS)
  }

  get recording(): boolean {
    return this.rec.state === 'recording'
  }

  /** Secondi registrati in questo segmento (le pause non contano). */
  durationSec(): Sec {
    const running = this.recording ? performance.now() - this.resumedAt : 0
    return (this.activeMs + running) / 1000
  }

  pause(): void {
    if (!this.recording) return
    this.activeMs += performance.now() - this.resumedAt
    this.rec.pause()
    this.flush()
  }

  resume(): void {
    if (this.rec.state !== 'paused') return
    this.resumedAt = performance.now()
    this.rec.resume()
  }

  /** Chiede subito i dati al recorder e li salva (pausa, app in background). */
  flush(): void {
    if (this.rec.state === 'inactive') return
    this.lastSave = -Infinity
    this.rec.requestData()
  }

  async stop(): Promise<void> {
    if (this.rec.state === 'inactive') return this.saving
    if (this.recording) this.activeMs += performance.now() - this.resumedAt
    this.rec.stop()
    await this.stopped
    this.save()
    await this.saving
  }

  private save(): void {
    this.lastSave = performance.now()
    if (!this.chunks.length) return
    const blob = new Blob(this.chunks, { type: this.rec.mimeType || pickMime() || 'audio/webm' })
    const durationSec = this.durationSec()
    this.saving = this.saving
      .then(() =>
        db.transaction('rw', db.audio, db.lessons, async () => {
          await db.audio.put({
            id: this.id,
            lessonId: this.lessonId,
            index: this.index,
            startSec: this.startSec,
            durationSec,
            mime: blob.type,
            blob,
          })
          await db.lessons.update(this.lessonId, { durationSec: this.startSec + durationSec, updatedAt: Date.now() })
        }),
      )
      .then(() => this.onSaved(''))
      .catch((err: unknown) => {
        // Ogni salvataggio riscrive tutto il segmento: liberato lo spazio, il successivo recupera anche questo.
        console.error('Salvataggio audio non riuscito', err)
        const full = err instanceof Error && /quota/i.test(`${err.name} ${err.message}`)
        this.onSaved(full
          ? 'Spazio esaurito sul tablet: l’audio NON viene salvato. Libera spazio (es. esporta e cancella vecchie lezioni): il prossimo salvataggio recupera tutto.'
          : 'Salvataggio dell’audio non riuscito: la registrazione continua e riprova tra 30 secondi.')
      })
  }
}
