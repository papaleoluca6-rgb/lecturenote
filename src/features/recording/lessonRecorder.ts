import { db, type AudioSegment, type Id, type Sec } from '../../db/schema'
import { clearRecordingFlag, setRecordingFlag } from './recordingFlag'
import { Segment } from './segment'
import { ScreenWakeLock } from './wakeLock'

export type RecState = 'idle' | 'recording' | 'paused'

/**
 * Oltre questa durata si apre un nuovo segmento sullo stesso microfono: ogni salvataggio (ogni 30 s)
 * riscrive tutto il segmento in corso, quindi segmenti corti = molte meno scritture sul tablet.
 */
const ROLLOVER_SEC = 5 * 60

/**
 * Segmenti fermati ma non ancora salvati (fine registrazione o cambio segmento), di tutte le lezioni.
 * Un segmento resta qui (con il suo audio in memoria) finché il salvataggio non riesce: si riprova da solo.
 */
const pending = new Set<Segment>()
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((f) => f())
const pendingOf = (lessonId: Id) => [...pending].filter((s) => s.lessonId === lessonId)

/** Salvataggi in corso della lezione: riaprendola si aspetta che finiscano. */
export const whenSaved = (lessonId: Id): Promise<void> => Promise.all(pendingOf(lessonId).map((s) => s.stop())).then(() => {})
/** Tutti i salvataggi in corso (es. prima di ricaricare l'app per un aggiornamento). */
export const allSaved = (): Promise<unknown> => Promise.allSettled([...pending].map((s) => s.stop()))
// Chiudere o ricaricare la pagina a salvataggio in corso perderebbe l'ultimo pezzo di audio: Chrome chiede conferma.
const warnUnload = (e: BeforeUnloadEvent) => { if (pending.size) e.preventDefault() }
addEventListener('beforeunload', warnUnload)

/** Ferma il segmento e lo tiene tra i salvataggi in corso finché non è su IndexedDB. */
function finish(seg: Segment): Promise<void> {
  pending.add(seg)
  changed()
  return seg.stop().finally(() => {
    pending.delete(seg)
    changed()
  })
}

const endOf = (segs: AudioSegment[]): Sec => segs.reduce((max, s) => Math.max(max, s.startSec + s.durationSec), 0)

/**
 * Registra una lezione: un flusso del microfono, uno o più segmenti audio in sequenza sulla timeline.
 * Riprendere una lezione già registrata (anche dopo un crash) aggiunge segmenti dopo l'ultimo.
 */
export class LessonRecorder {
  state: RecState = 'idle'
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

  /** Riceve gli avvisi di tutti i segmenti (anche di sessioni precedenti ancora da salvare). Restituisce come smettere. */
  watch(): () => void {
    listeners.add(this.onChange)
    return () => { listeners.delete(this.onChange) }
  }

  /** true mentre l'audio di una sessione già fermata viene scritto su IndexedDB. */
  get saving(): boolean {
    return this.state === 'idle' && pendingOf(this.lessonId).length > 0
  }

  /** Primo salvataggio fallito (es. spazio esaurito): va mostrato, altrimenti si perde la lezione senza saperlo. */
  get saveError(): string {
    return [this.seg, ...pendingOf(this.lessonId)].find((s) => s?.error)?.error ?? ''
  }

  /** true se dell'audio non si riesce a salvare da troppo tempo: si può scaricare come file. */
  get unsaved(): boolean {
    return pendingOf(this.lessonId).some((s) => s.stuck)
  }

  /** Scarica l'audio che non si riesce a salvare, per non perderlo (nome con data e minuto, per riconoscerlo). */
  downloadUnsaved(): void {
    const day = new Date().toISOString().slice(0, 10)
    for (const s of pendingOf(this.lessonId).filter((p) => p.stuck)) {
      const blob = s.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `lezione-${day}-${this.lessonId.slice(0, 6)}-dal-minuto-${Math.floor(s.startSec / 60)}.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    }
  }

  /** Dopo averlo scaricato: smette di riprovare il salvataggio di quell'audio (sblocca la lezione e la chiusura dell'app). */
  discardUnsaved(): void {
    for (const s of pendingOf(this.lessonId).filter((p) => p.stuck)) s.abandon()
  }

  /** Flusso del microfono in uso (null da fermo): lo condividono i servizi che lavorano su blocchi di audio. */
  get micStream(): MediaStream | null {
    return this.stream
  }

  /** Posizione attuale sulla timeline della lezione, in secondi. */
  elapsedSec(): Sec {
    return this.seg ? this.seg.startSec + this.seg.durationSec() : this.baseSec
  }

  /**
   * Riparte da dove finisce l'audio, contando anche i segmenti ancora da salvare (senza aspettarli: un salvataggio
   * che continua a fallire non deve bloccare la lezione). Restituisce il prossimo indice di segmento.
   */
  private async resumePoint(): Promise<number> {
    const segs = await db.audio.where('lessonId').equals(this.lessonId).toArray()
    const waiting = pendingOf(this.lessonId)
    this.baseSec = Math.max(endOf(segs), ...waiting.map((s) => s.startSec + s.durationSec()))
    return Math.max(0, ...segs.map((s) => s.index + 1), ...waiting.map((s) => s.index + 1))
  }

  async load(): Promise<void> {
    await this.resumePoint()
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
    const nextIndex = await this.resumePoint()
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    })
    if (this.cancelled) return stream.getTracks().forEach((t) => t.stop())
    this.stream = stream
    for (const t of this.stream.getAudioTracks()) t.addEventListener('ended', () => void this.stop())
    this.seg = new Segment(this.stream, this.lessonId, nextIndex, this.baseSec, changed)
    this.state = 'recording'
    setRecordingFlag(this.lessonId)
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
  tick(): void {
    const old = this.seg
    if (!old || !this.stream || this.state !== 'recording' || old.durationSec() < ROLLOVER_SEC) return
    this.seg = new Segment(this.stream, this.lessonId, old.index + 1, old.startSec + old.durationSec(), changed)
    void finish(old)
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
    document.removeEventListener('visibilitychange', this.onHidden)
    this.wake.release()
    const saved = seg ? finish(seg) : Promise.resolve()
    // Il microfono si chiude quando il recorder ha consegnato gli ultimi dati, anche se il salvataggio deve ancora riuscire.
    void (seg?.ended ?? Promise.resolve()).then(() => stream?.getTracks().forEach((t) => t.stop()))
    this.onChange()
    return saved.then(() => clearRecordingFlag(this.lessonId))
  }
}
