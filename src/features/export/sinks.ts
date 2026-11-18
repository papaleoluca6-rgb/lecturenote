/** Destinazioni dell'audio convertito: raccolgono i byte in Blob da ~1 MB e li dividono in file. */

/** Sotto il limite di 200 MB per fonte di NotebookLM, con margine. */
export const MAX_FILE_BYTES = 190_000_000
const PART_BYTES = 1 << 20

export interface AudioSink {
  readonly sampleRate: number
  readonly ext: string
  readonly mime: string
  /** Campioni mono alla frequenza sampleRate, valori tra -1 e 1. */
  write(pcm: Float32Array<ArrayBuffer>): Promise<void>
  /** Un Blob per ogni file da esportare (più di uno se supera il limite). */
  finish(): Promise<Blob[]>
  /** Chiude tutto senza produrre file (annullamento o errore). */
  close(): void
}

/** Accumula piccoli pezzi di byte in Blob da ~1 MB, così la memoria resta bassa. */
export class PartWriter {
  private chunks: BlobPart[] = []
  private chunkBytes = 0
  private parts: Blob[] = []
  /** Byte nel file in corso. */
  bytes = 0

  add(b: Uint8Array<ArrayBuffer>): void {
    this.chunks.push(b)
    this.chunkBytes += b.byteLength
    this.bytes += b.byteLength
    if (this.chunkBytes >= PART_BYTES) this.seal()
  }

  /** Chiude il file in corso e ne restituisce i pezzi. */
  cut(): Blob[] {
    this.seal()
    const out = this.parts
    this.parts = []
    this.bytes = 0
    return out
  }

  private seal(): void {
    if (!this.chunks.length) return
    this.parts.push(new Blob(this.chunks))
    this.chunks = []
    this.chunkBytes = 0
  }
}

function wavHeader(samples: number, rate: number): ArrayBuffer {
  const h = new DataView(new ArrayBuffer(44))
  const ascii = (o: number, s: string) => { for (let i = 0; i < s.length; i++) h.setUint8(o + i, s.charCodeAt(i)) }
  ascii(0, 'RIFF')
  h.setUint32(4, 36 + samples * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  h.setUint32(16, 16, true)
  h.setUint16(20, 1, true) // PCM
  h.setUint16(22, 1, true) // mono
  h.setUint32(24, rate, true)
  h.setUint32(28, rate * 2, true)
  h.setUint16(32, 2, true)
  h.setUint16(34, 16, true)
  ascii(36, 'data')
  h.setUint32(40, samples * 2, true)
  return h.buffer
}

/** WAV PCM 16 bit mono: lo legge chiunque, ma pesa ~1,9 MB al minuto a 16 kHz. */
export function wavSink(sampleRate = 16_000, maxBytes = MAX_FILE_BYTES): AudioSink {
  const maxSamples = Math.floor((maxBytes - 44) / 2)
  const writer = new PartWriter()
  const files: Blob[] = []
  let samples = 0

  const endFile = () => {
    files.push(new Blob([wavHeader(samples, sampleRate), ...writer.cut()], { type: 'audio/wav' }))
    samples = 0
  }

  return {
    sampleRate,
    ext: 'wav',
    mime: 'audio/wav',
    async write(pcm) {
      for (let i = 0; i < pcm.length;) {
        if (samples >= maxSamples) endFile()
        const n = Math.min(maxSamples - samples, pcm.length - i)
        const out = new Int16Array(n)
        for (let k = 0; k < n; k++) {
          const s = pcm[i + k]
          out[k] = s >= 1 ? 32767 : s <= -1 ? -32768 : Math.round(s * 32767)
        }
        writer.add(new Uint8Array(out.buffer))
        samples += n
        i += n
      }
    },
    async finish() {
      if (samples > 0 || !files.length) endFile()
      return files
    },
    close() {},
  }
}
