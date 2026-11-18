import { db, type Id, type Sec } from '../../db/schema'
import { Segment } from './segment'
import { ScreenWakeLock } from './wakeLock'

export type RecState = 'idle' | 'recording' | 'paused'

/** Oltre questa durata si apre un nuovo segmento sullo stesso microfono: blob più piccoli, salvataggi più leggeri. */
const ROLLOVER_SEC = 20 * 60

/**
 * Registra una lezione: un flusso del microfono, uno o più segmenti audio in sequenza sulla timeline.
 * Riprendere una lezione già registrata (anche dopo un crash) aggiunge segmenti dopo l'ultimo.
 */
export class LessonRecorder {
  state: RecState = 'idle'
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

  async load(): Promise<void> {
    const segs = await db.audio.where('lessonId').equals(this.lessonId).toArray()
    this.baseSec = segs.reduce((max, s) => Math.max(max, s.startSec + s.durationSec), 0)
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') return
    const segs = await db.audio.where('lessonId').equals(this.lessonId).toArray()
    this.baseSec = segs.reduce((max, s) => Math.max(max, s.startSec + s.durationSec), 0)
    const nextIndex = segs.reduce((max, s) => Math.max(max, s.index + 1), 0)
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    })
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

  /** Chiude il segmento in corso, salva e libera microfono e schermo. */
  async stop(): Promise<void> {
    if (this.state === 'idle') return
    const seg = this.seg
    if (seg) this.baseSec = seg.startSec + seg.durationSec()
    this.state = 'idle'
    this.seg = null
    if (seg) {
      await seg.stop()
      this.baseSec = seg.startSec + seg.durationSec()
    }
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    document.removeEventListener('visibilitychange', this.onHidden)
    this.wake.release()
    this.onChange()
  }
}
