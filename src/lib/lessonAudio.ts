import type { AudioSegment, Sec } from '../db/schema'

/**
 * Riproduce l'audio di una lezione come un'unica traccia, anche se è diviso in più segmenti.
 * Condiviso da ripasso e slide (una sola istanza per lezione, creata in app/): chi mostra lo stato si iscrive con subscribe().
 */
export class LessonAudio {
  readonly el = new Audio()
  private segs: AudioSegment[] = []
  private i = -1
  private url = ''
  /** Punto del segmento da raggiungere appena il file è pronto (prima non si può impostare currentTime). */
  private pendingOffset: Sec = 0
  /** Da far partire appena il file è pronto (un solo ascoltatore: un caricamento vecchio non deve far partire l'audio). */
  private pendingPlay = false
  private readonly listeners = new Set<() => void>()
  private readonly emit = () => this.listeners.forEach((f) => f())

  constructor() {
    this.el.preload = 'metadata'
    for (const ev of ['timeupdate', 'play', 'pause', 'loadedmetadata']) this.el.addEventListener(ev, this.emit)
    // Il tempo si può impostare solo quando il file è pronto.
    this.el.addEventListener('loadedmetadata', () => {
      if (this.pendingOffset) this.el.currentTime = this.pendingOffset
      if (this.pendingPlay) void this.el.play().catch(() => {})
      this.pendingPlay = false
    })
    this.el.addEventListener('ended', () => {
      if (this.i + 1 < this.segs.length) this.load(this.i + 1, 0, true)
      else this.emit()
    })
  }

  /** Avvisa a ogni avanzamento, play/pausa o cambio dei segmenti. Restituisce come annullare. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  setSegments(segs: AudioSegment[]): void {
    const cur = this.segs[this.i]
    this.segs = segs
    const i = cur ? segs.findIndex((s) => s.id === cur.id) : -1
    if (cur && i < 0) this.unload()
    else if (cur) {
      this.i = i
      // Il segmento che si sta ascoltando è stato risalvato più lungo (fine registrazione): si ricarica dallo stesso punto.
      // Se il file non era ancora pronto, valgono il punto e il play richiesti, non il tempo (ancora 0) dell'elemento.
      const loading = this.el.readyState < 1
      if (segs[i].blob.size !== cur.blob.size) this.load(i, loading ? this.pendingOffset : this.el.currentTime, loading ? this.pendingPlay : !this.el.paused)
    }
    this.emit()
  }

  get total(): Sec {
    return this.segs.reduce((m, s) => Math.max(m, s.startSec + s.durationSec), 0)
  }

  get time(): Sec {
    if (this.i < 0) return 0
    return this.segs[this.i].startSec + (this.el.readyState < 1 ? this.pendingOffset : this.el.currentTime)
  }

  get playing(): boolean {
    return !this.el.paused
  }

  get empty(): boolean {
    return this.segs.length === 0
  }

  /** Salta al secondo `ts` della lezione e riproduce. */
  playAt(ts: Sec): void {
    if (!this.segs.length) return
    const t = Math.max(0, Math.min(ts, this.total))
    // Ultimo segmento iniziato prima di t (in un vuoto tra segmenti: la fine del precedente, poi si passa al successivo).
    let i = 0
    this.segs.forEach((s, k) => { if (s.startSec <= t) i = k })
    const offset = Math.max(0, t - this.segs[i].startSec)
    if (i === this.i) {
      // File non ancora pronto: lo prende il listener di load(), altrimenti rimetterebbe il punto vecchio.
      if (this.el.readyState < 1) this.pendingOffset = offset
      else this.el.currentTime = offset
      void this.el.play().catch(() => {})
    } else this.load(i, offset, true)
  }

  toggle(): void {
    if (this.i < 0) return this.playAt(0)
    if (this.el.paused) void this.el.play().catch(() => {})
    else this.el.pause()
  }

  skip(delta: Sec): void {
    this.playAt(this.time + delta)
  }

  pause(): void {
    this.el.pause()
  }

  dispose(): void {
    this.unload()
  }

  private unload(): void {
    this.el.pause()
    this.el.removeAttribute('src')
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = ''
    this.i = -1
  }

  private load(i: number, offset: Sec, play: boolean): void {
    if (this.url) URL.revokeObjectURL(this.url)
    this.i = i
    this.url = URL.createObjectURL(this.segs[i].blob)
    this.el.src = this.url
    this.pendingOffset = offset
    this.pendingPlay = play
  }
}
