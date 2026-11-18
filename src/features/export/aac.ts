import { MAX_FILE_BYTES, PartWriter, type AudioSink } from './sinks'
import { waitQueue } from './queue'

/** Frequenze provate in ordine: 16 kHz basta per la voce; alcuni encoder accettano solo 44,1/48 kHz. */
const RATES = [16_000, 24_000, 44_100, 48_000]
/** 48 kbps basta per la voce; l'encoder di Windows accetta solo da 96 kbps in su. */
const BITRATES = [48_000, 64_000, 96_000]
const ADTS_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]

export interface AacSettings { sampleRate: number; bitrate: number }

const config = ({ sampleRate, bitrate }: AacSettings): AudioEncoderConfig =>
  ({ codec: 'mp4a.40.2', sampleRate, numberOfChannels: 1, bitrate, aac: { format: 'adts' } }) as AudioEncoderConfig

/** Intestazione ADTS di 7 byte (AAC-LC, senza CRC) per un frame AAC "nudo". */
function adtsHeader(payload: number, sampleRate: number): Uint8Array<ArrayBuffer> {
  const len = payload + 7
  const fi = ADTS_RATES.indexOf(sampleRate)
  return new Uint8Array([0xff, 0xf1, (1 << 6) | (fi << 2), (1 << 6) | (len >> 11), (len >> 3) & 0xff, ((len & 7) << 5) | 0x1f, 0xfc])
}

const isAdts = (b: Uint8Array) => b.length > 7 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0

/** Prova davvero l'encoder con un po' di silenzio: isConfigSupported a volte dice sì e poi fallisce. */
async function tryAac(set: AacSettings): Promise<boolean> {
  const cfg = config(set)
  const { sampleRate } = set
  try {
    if (!(await AudioEncoder.isConfigSupported(cfg)).supported) return false
  } catch {
    return false
  }
  let out = 0
  let failed = false
  const enc = new AudioEncoder({ output: () => { out++ }, error: () => { failed = true } })
  try {
    enc.configure(cfg)
    const data = new AudioData({ format: 'f32', sampleRate, numberOfFrames: 4096, numberOfChannels: 1, timestamp: 0, data: new Float32Array(4096) })
    enc.encode(data)
    data.close()
    await enc.flush()
    return out > 0 && !failed
  } catch {
    return false
  } finally {
    if (enc.state !== 'closed') enc.close()
  }
}

let probe: Promise<AacSettings | null> | undefined

/** Impostazioni AAC che questo dispositivo sa usare, oppure null (allora si usa il WAV). */
export function aacSettings(): Promise<AacSettings | null> {
  probe ??= (async () => {
    if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return null
    for (const bitrate of BITRATES) {
      for (const sampleRate of RATES) if (await tryAac({ sampleRate, bitrate })) return { sampleRate, bitrate }
    }
    return null
  })()
  return probe
}

/** AAC-LC in frame ADTS concatenati (.aac): ~0,36 MB al minuto a 48 kbps. */
export function aacSink(set: AacSettings, maxBytes = MAX_FILE_BYTES): AudioSink {
  const { sampleRate } = set
  const writer = new PartWriter()
  const files: Blob[] = []
  let failure: unknown = null
  let written = 0

  const enc = new AudioEncoder({
    output: (chunk) => {
      const raw = new Uint8Array(chunk.byteLength)
      chunk.copyTo(raw)
      const frame = isAdts(raw) ? [raw] : [adtsHeader(raw.length, sampleRate), raw]
      const size = frame.reduce((n, b) => n + b.length, 0)
      if (writer.bytes + size > maxBytes) files.push(new Blob(writer.cut(), { type: 'audio/aac' }))
      for (const b of frame) writer.add(b)
    },
    error: (e) => { failure = e },
  })
  enc.configure(config(set))

  const check = () => {
    if (failure) throw new Error(`Codifica AAC non riuscita: ${failure instanceof Error ? failure.message : String(failure)}`)
  }

  return {
    sampleRate,
    ext: 'aac',
    mime: 'audio/aac',
    async write(pcm) {
      check()
      if (!pcm.length) return
      const data = new AudioData({ format: 'f32', sampleRate, numberOfFrames: pcm.length, numberOfChannels: 1, timestamp: Math.round((written * 1e6) / sampleRate), data: pcm })
      written += pcm.length
      enc.encode(data)
      data.close()
      await waitQueue(enc, () => enc.encodeQueueSize, 8)
    },
    async finish() {
      check()
      await enc.flush()
      enc.close()
      check()
      if (writer.bytes > 0 || !files.length) files.push(new Blob(writer.cut(), { type: 'audio/aac' }))
      return files
    },
    close() {
      if (enc.state !== 'closed') enc.close()
    },
  }
}
