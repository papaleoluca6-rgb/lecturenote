import type { AudioSegment, Sec } from '../../db/schema'

/** Riproduce l'audio di una lezione come un'unica traccia, anche se è diviso in più segmenti. */
export class LessonAudio {
  readonly el = new Audio()
  private segs: AudioSegment[] = []
  private i = -1
  private url = ''

  constructor(onChange: () => void) {
    this.el.preload = 'metadata'
    for (const ev of ['timeupdate', 'play', 'pause', 'loadedmetadata']) this.el.addEventListener(ev, onChange)
    this.el.addEventListener('ended', () => {
      if (this.i + 1 < this.segs.length) this.load(this.i + 1, 0, true)
      else onChange()
    })
  }

  setSegments(segs: AudioSegment[]): void {
    this.segs = segs
  }

  get total(): Sec {
    return this.segs.reduce((m, s) => Math.max(m, s.startSec + s.durationSec), 0)
  }

  get time(): Sec {
    return this.i < 0 ? 0 : this.segs[this.i].startSec + this.el.currentTime
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
    let i = this.segs.findIndex((s) => t >= s.startSec && t < s.startSec + s.durationSec)
    if (i < 0) i = t <= this.segs[0].startSec ? 0 : this.segs.length - 1
    const offset = Math.max(0, t - this.segs[i].startSec)
    if (i === this.i) {
      this.el.currentTime = offset
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
    this.el.pause()
    this.el.removeAttribute('src')
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = ''
  }

  private load(i: number, offset: Sec, play: boolean): void {
    if (this.url) URL.revokeObjectURL(this.url)
    this.i = i
    this.url = URL.createObjectURL(this.segs[i].blob)
    this.el.src = this.url
    // Il tempo si può impostare solo quando il file è pronto.
    this.el.addEventListener('loadedmetadata', () => {
      if (offset) this.el.currentTime = offset
      if (play) void this.el.play().catch(() => {})
    }, { once: true })
  }
}
