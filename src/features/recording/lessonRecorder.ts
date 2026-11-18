import { db, type Id, type Sec } from '../../db/schema'
import { Segment } from './segment'
import { ScreenWakeLock } from './wakeLock'

export type RecState = 'idle' | 'recording' | 'paused'

/** Oltre questa durata si apre un nuovo segmento sullo stesso microfono: blob più piccoli, salvataggi più leggeri. */
const ROLLOVER_SEC = 20 * 60

/** Salvataggi finali ancora in corso, per lezione: riaprendo la lezione si aspetta che finiscano. */
const pendingSaves = new Map<Id, Promise<void>>()
export const whenSaved = (lessonId: Id): Promise<void> => pendingSaves.get(lessonId) ?? Promise.resolve()
/** Tutti i salvataggi in corso (es. prima di ricaricare l'app per un aggiornamento). */
export const allSaved = (): Promise<unknown> => Promise.allSettled([...pendingSaves.values()])
// Chiudere o ricaricare la pagina a salvataggio in corso perderebbe l'ultimo pezzo di audio: Chrome chiede conferma.
const warnUnload = (e: BeforeUnloadEvent) => { if (pendingSaves.size) e.preventDefault() }
addEventListener('beforeunload', warnUnload)

/**
 * Registra una lezione: un flusso del microfono, uno o più segmenti audio in sequenza sulla timeline.
 * Riprendere una lezione già registrata (anche dopo un crash) aggiunge segmenti dopo l'ultimo.
 */
export class LessonRecorder {
  state: RecState = 'idle'
  /** true mentre l'ultimo pezzo di audio viene scritto su IndexedDB dopo lo stop. */
  saving = false
  private starting = false
  /** Freccia indietro premuta mentre start() aspettava: il microfono appena aperto va richiuso. */
  private cancelled = false
  private stream: MediaStream | null = null
  private seg: Segment | null = null
  private baseSec: Sec = 0
  readonly wake = new ScreenWakeLock()

  private onHidden = () => {
    if (document.visibilityState === 'hidden') this.seg?.flush()
  }

  private readonly lessonId: Id
  private readonly onChange: () => void

  constructor(lessonId: Id, onChange: () => void) {
    this.lessonId = lessonId
    this.onChange = onChange
  }

  /** Flusso del microfono in uso (null da fermo): lo condividono i servizi che lavorano su blocchi di audio. */
  get micStream(): MediaStream | null {
    return this.stream
  }

  /** Posizione attuale sulla timeline della lezione, in secondi. */
  elapsedSec(): Sec {
    return this.seg ? this.seg.startSec + this.seg.durationSec() : this.baseSec
  }

  /** Aspetta il salvataggio di una sessione precedente della stessa lezione, mostrando «Salvataggio…». */
  private async waitSaved(): Promise<void> {
    if (!pendingSaves.has(this.lessonId)) return
    this.saving = true
    this.onChange()
    await whenSaved(this.lessonId)
    this.saving = false
    this.onChange()
  }

  async load(): Promise<void> {
    await this.waitSaved()
    const segs = await db.audio.where('lessonId').equals(this.lessonId).toArray()
    this.baseSec = segs.reduce((max, s) => Math.max(max, s.startSec + s.durationSec), 0)
  }

  async start(): Promise<void> {
    // Doppio tocco su Registra: un solo avvio (altrimenti due microfoni e un segmento che registra per sempre).
    if (this.state !== 'idle' || this.starting) return
    this.starting = true
    this.cancelled = false
    try {
      await this.begin()
    } finally {
      this.starting = false
    }
  }

  private async begin(): Promise<void> {
    await this.waitSaved()
    const segs = await db.audio.where('lessonId').equals(this.lessonId).toArray()
    this.baseSec = segs.reduce((max, s) => Math.max(max, s.startSec + s.durationSec), 0)
    const nextIndex = segs.reduce((max, s) => Math.max(max, s.index + 1), 0)
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    })
    if (this.cancelled) return stream.getTracks().forEach((t) => t.stop())
    this.stream = stream
    for (const t of this.stream.getAudioTracks()) t.addEventListener('ended', () => void this.stop())
    this.seg = new Segment(this.stream, this.lessonId, nextIndex, this.baseSec)
    this.state = 'recording'
    document.addEventListener('visibilitychange', this.onHidden)
    await this.wake.acquire()
    this.onChange()
  }

  pause(): void {
    if (this.state !== 'recording') return
    this.seg?.pause()
    this.state = 'paused'
    this.onChange()
  }

  resume(): void {
    if (this.state !== 'paused') return
    this.seg?.resume()
    this.state = 'recording'
    this.onChange()
  }

  /** Da chiamare periodicamente: apre un nuovo segmento quando quello corrente è troppo lungo. */
  async tick(): Promise<void> {
    const old = this.seg
    if (!old || !this.stream || this.state !== 'recording' || old.durationSec() < ROLLOVER_SEC) return
    this.seg = new Segment(this.stream, this.lessonId, old.index + 1, old.startSec + old.durationSec())
    await old.stop()
  }

  /**
   * Ferma subito (l'interfaccia torna "Pronto" all'istante) e salva in sottofondo:
   * con un segmento lungo la scrittura su IndexedDB può richiedere qualche secondo sul tablet.
   */
  stop(): Promise<void> {
    if (this.state === 'idle') {
      if (this.starting) this.cancelled = true
      return whenSaved(this.lessonId)
    }
    const seg = this.seg
    const stream = this.stream
    if (seg) this.baseSec = seg.startSec + seg.durationSec()
    this.state = 'idle'
    this.seg = null
    this.stream = null
    this.saving = true
    document.removeEventListener('visibilitychange', this.onHidden)
    this.wake.release()
    this.onChange()
    const done = (async () => {
      try {
        if (seg) await seg.stop()
      } finally {
        stream?.getTracks().forEach((t) => t.stop())
        this.saving = false
        pendingSaves.delete(this.lessonId)
        this.onChange()
      }
    })()
    pendingSaves.set(this.lessonId, done)
    return done
  }
}
