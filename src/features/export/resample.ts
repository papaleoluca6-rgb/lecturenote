/** Mono e ricampionamento a blocchi (es. 48 kHz → 16 kHz) per l'audio esportato. */

/** Media dei canali di un AudioData come Float32 mono. */
export function toMono(d: AudioData): Float32Array<ArrayBuffer> {
  const n = d.numberOfFrames
  const ch = d.numberOfChannels
  const out = new Float32Array(n)
  if (d.format === 'f32' || d.format === 's16') {
    const all = d.format === 'f32' ? new Float32Array(n * ch) : new Int16Array(n * ch)
    d.copyTo(all, { planeIndex: 0 })
    const k = d.format === 'f32' ? 1 / ch : 1 / (32768 * ch)
    for (let i = 0, j = 0; i < n; i++) {
      let s = 0
      for (let c = 0; c < ch; c++) s += all[j++]
      out[i] = s * k
    }
    return out
  }
  const plane = new Float32Array(n)
  for (let c = 0; c < ch; c++) {
    d.copyTo(plane, { planeIndex: c, format: 'f32-planar' })
    for (let i = 0; i < n; i++) out[i] += plane[i] / ch
  }
  return out
}

/** Filtro passa-basso FIR (sinc con finestra di Hamming), guadagno 1. */
function lowPass(cutoff: number, half: number): Float32Array {
  const h = new Float32Array(2 * half + 1)
  let sum = 0
  for (let k = -half; k <= half; k++) {
    const x = 2 * cutoff * k
    const sinc = k === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)
    const w = 0.54 + 0.46 * Math.cos((Math.PI * k) / (half + 1))
    sum += h[k + half] = 2 * cutoff * sinc * w
  }
  for (let i = 0; i < h.length; i++) h[i] /= sum
  return h
}

/**
 * Ricampionatore in streaming: filtro anti-aliasing quando si scende di frequenza, poi
 * interpolazione lineare. Con rapporti interi (48k → 16k) prende semplicemente 1 campione ogni 3.
 */
export class Resampler {
  private readonly step: number
  private readonly taps: Float32Array | null
  private readonly half: number
  /** Campioni in attesa; buf[0] è il campione assoluto numero base. */
  private buf: Float32Array
  private base: number
  private next = 0
  private count = 0

  constructor(inRate: number, outRate: number) {
    this.step = inRate / outRate
    this.half = this.step > 1 ? Math.ceil(8 * this.step) : 0
    this.taps = this.step > 1 ? lowPass((0.45 * outRate) / inRate, this.half) : null
    this.buf = new Float32Array(this.half)
    this.base = -this.half
  }

  push(x: Float32Array): Float32Array<ArrayBuffer> {
    if (this.step === 1) return Float32Array.from(x)
    const all = new Float32Array(this.buf.length + x.length)
    all.set(this.buf)
    all.set(x, this.buf.length)
    this.buf = all
    this.count += x.length
    return this.run(this.base + all.length - 1 - this.half)
  }

  /** Ultimi campioni a fine file (completa il filtro con silenzio). */
  flush(): Float32Array<ArrayBuffer> {
    if (this.step === 1) return new Float32Array(0)
    const pad = new Float32Array(this.half + 2)
    const all = new Float32Array(this.buf.length + pad.length)
    all.set(this.buf)
    this.buf = all
    return this.run(Math.min(this.count - 1, this.base + all.length - 2 - this.half))
  }

  /** Calcola le uscite finché il punto di interpolazione non supera l'indice last. */
  private run(last: number): Float32Array<ArrayBuffer> {
    const n = Math.max(0, Math.floor((last - this.next) / this.step) + 1)
    const out = new Float32Array(n)
    for (let k = 0; k < n; k++) {
      const p = this.next + k * this.step
      const i = Math.floor(p)
      const fr = p - i
      const a = this.at(i)
      out[k] = fr > 1e-9 ? a + (this.at(i + 1) - a) * fr : a
    }
    this.next += n * this.step
    // Tiene solo la coda che serve al prossimo blocco.
    const keepFrom = Math.max(0, Math.floor(this.next) - this.half - this.base)
    this.buf = this.buf.slice(keepFrom)
    this.base += keepFrom
    return out
  }

  private at(i: number): number {
    const b = this.buf
    const o = i - this.base
    if (!this.taps) return b[o] ?? 0
    const h = this.taps
    let s = 0
    for (let k = 0, j = o - this.half; k < h.length; k++, j++) s += h[k] * b[j]
    return s
  }
}
