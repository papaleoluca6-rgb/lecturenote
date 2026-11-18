// Blocchi di audio per i servizi AI: ogni blocco è un file completo, convertito in WAV 16 kHz mono
// (formato accettato da Gemini, a differenza del webm di Chrome).

const RATE = 16000

export function encodeWav(samples: Float32Array, rate = RATE): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true))
  return new Blob([buf], { type: 'audio/wav' })
}

export const silenceWav = (sec = 1) => encodeWav(new Float32Array(RATE * sec))

export async function blobToWav16k(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
  } finally {
    void ctx.close()
  }
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * RATE)), RATE)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  return encodeWav((await off.startRendering()).getChannelData(0))
}

export function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error ?? new Error('Lettura audio fallita'))
    r.readAsDataURL(blob)
  })
}

/** Registra blocchi consecutivi di `sec` secondi sullo stesso stream della registrazione principale. */
export class BlockRecorder {
  private on = true
  private timer = 0
  private rec: MediaRecorder | null = null
  private stream: MediaStream
  private sec: number
  private onBlock: (b: Blob, endAt: number) => void

  constructor(stream: MediaStream, sec: number, onBlock: (b: Blob, endAt: number) => void) {
    this.stream = stream
    this.sec = sec
    this.onBlock = onBlock
    this.next()
  }

  private next() {
    const rec = new MediaRecorder(this.stream)
    const parts: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data)
    rec.onstop = () => this.onBlock(new Blob(parts, { type: rec.mimeType }), performance.now())
    rec.start()
    this.rec = rec
    this.timer = window.setTimeout(() => {
      rec.stop()
      if (this.on) this.next()
    }, this.sec * 1000)
  }

  stop() {
    this.on = false
    clearTimeout(this.timer)
    if (this.rec?.state === 'recording') this.rec.stop()
  }
}
