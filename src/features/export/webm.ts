/**
 * Lettore minimo di WebM (EBML) per l'audio del registratore: legge il Blob a finestre
 * da ~1 MB e restituisce i frame uno alla volta, senza mai tenere tutto il file in memoria.
 */

const WINDOW = 1 << 20
const EOF = -1
const INVALID = -2
const UNKNOWN = -3

const SEGMENT = 0x18538067, INFO = 0x1549a766, TRACKS = 0x1654ae6b, TRACK_ENTRY = 0xae, AUDIO = 0xe1
const CLUSTER = 0x1f43b675, BLOCK_GROUP = 0xa0
const CONTAINERS = new Set([SEGMENT, INFO, TRACKS, TRACK_ENTRY, AUDIO, CLUSTER, BLOCK_GROUP])

const TIMECODE_SCALE = 0x2ad7b1, TRACK_NUMBER = 0xd7, TRACK_TYPE = 0x83, CODEC_ID = 0x86, CODEC_PRIVATE = 0x63a2
const SAMPLING_FREQUENCY = 0xb5, CHANNELS = 0x9f, TIMECODE = 0xe7, SIMPLE_BLOCK = 0xa3, BLOCK = 0xa1
const LEAVES = new Set([TIMECODE_SCALE, TRACK_NUMBER, TRACK_TYPE, CODEC_ID, CODEC_PRIVATE, SAMPLING_FREQUENCY, CHANNELS, TIMECODE, SIMPLE_BLOCK, BLOCK])

export interface WebmTrack {
  number: number
  type: number
  codec: string
  codecPrivate?: Uint8Array<ArrayBuffer>
  sampleRate: number
  channels: number
}

export type WebmEvent =
  | { kind: 'track'; track: WebmTrack }
  /** pos = byte del file letti finora (per la barra di avanzamento). */
  | { kind: 'frame'; data: Uint8Array<ArrayBuffer>; timeUs: number; pos: number }

/** Lunghezza di un vint EBML dal suo primo byte (1..8), 0 se il byte non è valido. */
const vintLen = (b: number) => (b ? Math.clz32(b) - 23 : 0)

class Reader {
  private readonly blob: Blob
  private buf = new Uint8Array(0)
  private start = 0
  pos = 0

  constructor(blob: Blob) {
    this.blob = blob
  }

  /** Garantisce n byte in memoria da pos; false se il file finisce prima. */
  async need(n: number): Promise<boolean> {
    if (this.pos >= this.start && this.pos + n <= this.start + this.buf.length) return true
    if (this.pos + n > this.blob.size) return false
    const to = Math.min(this.blob.size, Math.max(this.pos + n, this.pos + WINDOW))
    this.buf = new Uint8Array(await this.blob.slice(this.pos, to).arrayBuffer())
    this.start = this.pos
    return true
  }

  byte(i = 0): number {
    return this.buf[this.pos - this.start + i]
  }

  take(n: number): Uint8Array<ArrayBuffer> {
    const o = this.pos - this.start
    this.pos += n
    return this.buf.slice(o, o + n)
  }

  /** Legge un vint: ID (marker tenuto) o dimensione (marker tolto, UNKNOWN se tutti 1). */
  async vint(isId: boolean): Promise<number> {
    if (!(await this.need(1))) return EOF
    const len = vintLen(this.byte())
    if (!len || (isId && len > 4)) return INVALID
    if (!(await this.need(len))) return EOF
    const mask = isId ? 0xff : 0xff >> len
    let v = this.byte() & mask
    let ones = v === mask
    for (let i = 1; i < len; i++) {
      const b = this.byte(i)
      ones &&= b === 0xff
      v = v * 256 + b
    }
    this.pos += len
    return !isId && ones ? UNKNOWN : v
  }

  /** Dopo dati rovinati: cerca il prossimo Cluster (1F 43 B6 75). */
  async findCluster(from: number): Promise<boolean> {
    this.pos = from
    while (await this.need(4)) {
      const o = this.pos - this.start
      const end = this.buf.length - 3
      for (let i = o; i < end; i++) {
        if (this.buf[i] === 0x1f && this.buf[i + 1] === 0x43 && this.buf[i + 2] === 0xb6 && this.buf[i + 3] === 0x75) {
          this.pos = this.start + i
          return true
        }
      }
      this.pos = this.start + Math.max(o + 1, end)
    }
    return false
  }
}

const uint = (d: Uint8Array) => d.reduce((v, b) => v * 256 + b, 0)
const float = (d: Uint8Array) => {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
  return d.length === 4 ? v.getFloat32(0) : d.length === 8 ? v.getFloat64(0) : 0
}

/** True se il Blob inizia con l'intestazione EBML (WebM/Matroska). */
export async function isWebm(blob: Blob): Promise<boolean> {
  const h = new Uint8Array(await blob.slice(0, 4).arrayBuffer())
  return h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3
}

/**
 * Scorre il file elemento per elemento senza ricorsione: entra nei contenitori che servono
 * (anche a dimensione sconosciuta, come quelli di MediaRecorder) e salta tutti gli altri.
 */
export async function* demuxWebm(blob: Blob): AsyncGenerator<WebmEvent> {
  const r = new Reader(blob)
  const entries: Partial<WebmTrack>[] = []
  let track: WebmTrack | null = null
  let scaleNs = 1_000_000
  let cluster = 0

  const pickTrack = (): WebmTrack | null => {
    const e = entries.find((t) => t.type === 2 || t.codec?.startsWith('A_'))
    if (!e || e.number === undefined) return null
    return { number: e.number, type: 2, codec: e.codec ?? '', codecPrivate: e.codecPrivate, sampleRate: e.sampleRate ?? 48_000, channels: e.channels ?? 1 }
  }

  for (;;) {
    const at = r.pos
    const id = await r.vint(true)
    if (id === EOF) return
    const size = id === INVALID ? INVALID : await r.vint(false)
    if (size === EOF) return
    if (size === INVALID || (size === UNKNOWN && !CONTAINERS.has(id))) {
      if (!(await r.findCluster(at + 1))) return
      continue
    }
    if (CONTAINERS.has(id)) {
      if (id === TRACK_ENTRY) entries.push({})
      if (id === CLUSTER && !track && (track = pickTrack())) yield { kind: 'track', track }
      continue
    }
    if (!LEAVES.has(id)) {
      r.pos += size
      continue
    }
    if (!(await r.need(size))) return
    const d = r.take(size)
    const e = entries[entries.length - 1] ?? {}
    switch (id) {
      case TIMECODE_SCALE: scaleNs = uint(d) || scaleNs; break
      case TRACK_NUMBER: e.number = uint(d); break
      case TRACK_TYPE: e.type = uint(d); break
      case CODEC_ID: e.codec = new TextDecoder().decode(d).replace(/\0+$/, ''); break
      case CODEC_PRIVATE: e.codecPrivate = d; break
      case SAMPLING_FREQUENCY: e.sampleRate = float(d); break
      case CHANNELS: e.channels = uint(d); break
      case TIMECODE: cluster = uint(d); break
      default: {
        if (!track && (track = pickTrack())) yield { kind: 'track', track }
        if (!track) break
        const n = vintLen(d[0])
        if (!n || d.length < n + 3) break
        const num = uint(d.subarray(0, n)) - 2 ** (7 * n)
        const flags = d[n + 2]
        // Con il "lacing" un blocco contiene più frame: Chrome non lo usa per Opus, quindi lo saltiamo.
        if (num !== track.number || flags & 0x06) break
        const rel = (d[n] << 24) >> 16 | d[n + 1]
        yield { kind: 'frame', data: d.subarray(n + 3), timeUs: ((cluster + rel) * scaleNs) / 1000, pos: r.pos }
      }
    }
  }
}
