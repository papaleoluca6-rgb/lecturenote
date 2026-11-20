import { db, newId, type Id, type Sec } from '../../db/schema'

const CHUNK_MS = 5000
/** Ogni quanto il segmento in corso viene salvato su IndexedDB: dopo un crash si perde al massimo questo. */
const SAVE_EVERY_MS = 30_000
/** Ultimo salvataggio fallito: si riprova a questo intervallo finché non riesce. */
const RETRY_MS = 15_000
/** Dopo questi tentativi falliti si offre anche di scaricare l'audio come file. */
const STUCK_AFTER = 5
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

const pickMime = (): string => MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''

/** Un MediaRecorder = un AudioSegment salvato in db.audio. Pausa e ripresa restano nello stesso segmento. */
export class Segment {
  readonly id: Id = newId()
  /** Errore dell'ultimo salvataggio di questo segmento ('' se riuscito): ogni segmento ha il suo. */
  error = ''
  private readonly rec: MediaRecorder
  private readonly chunks: Blob[] = []
  private activeMs = 0
  private resumedAt = performance.now()
  private lastSave = performance.now()
  private failures = 0
  /** Esito dell'ultimo salvataggio in coda (true = salvato, o lezione eliminata). */
  private saving: Promise<boolean> = Promise.resolve(true)
  private done: Promise<void> | null = null
  /** Messo da parte dall'utente dopo averlo scaricato come file: non si riprova più a salvarlo. */
  private abandoned = false
  /** Si risolve quando il recorder si è fermato e ha consegnato gli ultimi dati. */
  readonly ended: Promise<void>

  readonly lessonId: Id
  readonly index: number
  readonly startSec: Sec
  /** Avvisa quando cambiano errore o tentativi. */
  private readonly onChange: () => void

  constructor(stream: MediaStream, lessonId: Id, index: number, startSec: Sec, onChange: () => void) {
    this.onChange = onChange
    this.lessonId = lessonId
    this.index = index
    this.startSec = startSec
    const mimeType = pickMime()
    this.rec = new MediaRecorder(stream, { ...(mimeType && { mimeType }), audioBitsPerSecond: 64_000 })
    this.ended = new Promise((resolve) => this.rec.addEventListener('stop', () => resolve(), { once: true }))
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data)
      if (performance.now() - this.lastSave >= SAVE_EVERY_MS) void this.save()
    }
    this.rec.start(CHUNK_MS)
  }

  get recording(): boolean {
    return this.rec.state === 'recording'
  }

  /** true quando l'ultimo salvataggio è fallito più volte: conviene scaricare l'audio. */
  get stuck(): boolean {
    return this.failures >= STUCK_AFTER
  }

  /** Secondi registrati in questo segmento (le pause non contano). */
  durationSec(): Sec {
    const running = this.recording ? performance.now() - this.resumedAt : 0
    return (this.activeMs + running) / 1000
  }

  /** Smette di riprovare il salvataggio (l'audio è stato scaricato come file): libera memoria e lezione. */
  abandon(): void {
    this.abandoned = true
    this.chunks.length = 0
  }

  blob(): Blob {
    return new Blob(this.chunks, { type: this.rec.mimeType || pickMime() || 'audio/webm' })
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

  /** Ferma il recorder (subito) e salva; si risolve solo quando l'audio è davvero su IndexedDB. */
  stop(): Promise<void> {
    if (!this.done) {
      if (this.rec.state !== 'inactive') {
        if (this.recording) this.activeMs += performance.now() - this.resumedAt
        this.rec.stop()
      }
      this.done = this.finish()
    }
    return this.done
  }

  private async finish(): Promise<void> {
    await this.ended
    // Finché il salvataggio non riesce l'audio resta in memoria (i pezzi del recorder) e si riprova.
    while (!this.abandoned && !(await this.save())) {
      this.failures++
      this.onChange()
      await new Promise((r) => setTimeout(r, RETRY_MS))
    }
  }

  private save(): Promise<boolean> {
    this.lastSave = performance.now()
    if (!this.chunks.length) return this.saving
    const blob = this.blob()
    const durationSec = this.durationSec()
    this.saving = this.saving.then(() => this.write(blob, durationSec))
    return this.saving
  }

  private async write(blob: Blob, durationSec: Sec): Promise<boolean> {
    try {
      await db.transaction('rw', db.audio, db.lessons, async () => {
        const lesson = await db.lessons.get(this.lessonId)
        // Lezione eliminata mentre l'audio si salvava: niente audio orfano.
        if (!lesson) return
        await db.audio.put({ id: this.id, lessonId: this.lessonId, index: this.index, startSec: this.startSec, durationSec, mime: blob.type, blob })
        // max: un segmento vecchio salvato in ritardo non deve accorciare la lezione.
        await db.lessons.update(this.lessonId, { durationSec: Math.max(lesson.durationSec, this.startSec + durationSec), updatedAt: Date.now() })
      })
      this.setError('')
      return true
    } catch (err) {
      // Ogni salvataggio riscrive tutto il segmento: liberato lo spazio, il successivo recupera anche questo.
      console.error('Salvataggio audio non riuscito', err)
      const full = err instanceof Error && /quota/i.test(`${err.name} ${err.message}`)
      this.setError(full
        ? 'Spazio esaurito sul tablet: l’audio NON viene salvato. Libera spazio (es. esporta e cancella vecchie lezioni): il prossimo salvataggio recupera tutto.'
        : 'Salvataggio dell’audio non riuscito: l’audio resta in memoria e riprovo tra poco. Non chiudere l’app.')
      return false
    }
  }

  private setError(error: string): void {
    if (error === this.error) return
    this.error = error
    this.onChange()
  }
}
