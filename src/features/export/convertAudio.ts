import { aacSettings, aacSink } from './aac'
import { tick, waitQueue } from './queue'
import { Resampler, toMono } from './resample'
import { wavSink } from './sinks'
import { demuxWebm, isWebm, type WebmTrack } from './webm'

export interface ConvertOptions {
  signal?: AbortSignal
  /** Byte del file originale già letti. */
  onProgress?: (bytesRead: number) => void
}

export interface ConvertedAudio {
  /** Un Blob per file: più di uno se l'audio supera il limite di NotebookLM. */
  blobs: Blob[]
  ext: string
  mime: string
}

export interface AudioPlan {
  format: 'aac' | 'wav' | 'none'
  /** Byte al minuto del file convertito (per stimare la dimensione). */
  bytesPerMin: number
}

const NO_WEBCODECS = 'Questo browser non sa convertire l\'audio della lezione (manca WebCodecs): aggiorna Chrome oppure esporta solo il testo.'

/** Formati che NotebookLM accetta già: si esportano così come sono. */
const PASS: [RegExp, string, string][] = [
  [/mp4|m4a/, 'm4a', 'audio/mp4'], [/aac/, 'aac', 'audio/aac'], [/mpeg|mp3/, 'mp3', 'audio/mpeg'], [/wav/, 'wav', 'audio/wav'],
]

const hasDecoder = () => typeof AudioDecoder !== 'undefined' && typeof EncodedAudioChunk !== 'undefined'

/** Cosa farà la conversione su questo dispositivo (per stimare la dimensione). */
export async function audioPlan(): Promise<AudioPlan> {
  if (!hasDecoder()) return { format: 'none', bytesPerMin: 0 }
  const aac = await aacSettings()
  // WAV: 16 kHz × 2 byte × 60 s.
  return aac ? { format: 'aac', bytesPerMin: (aac.bitrate / 8) * 60 } : { format: 'wav', bytesPerMin: 1_920_000 }
}

/** Rende un segmento audio accettabile da NotebookLM (mp3, wav, m4a, aac). */
export async function convertAudio(blob: Blob, mime: string, opts: ConvertOptions = {}): Promise<ConvertedAudio> {
  const webm = await isWebm(blob)
  const pass = PASS.find(([re]) => re.test(mime))
  if (pass && !webm) return { blobs: [blob], ext: pass[1], mime: pass[2] }
  if (!webm) throw new Error(`Formato audio non supportato (${mime || 'sconosciuto'}): esporta solo il testo.`)
  if (!hasDecoder()) throw new Error(NO_WEBCODECS)
  return webmToNotebook([blob], opts)
}

/**
 * Più segmenti WebM della stessa lezione → un solo audio (diviso solo oltre il limite di NotebookLM).
 * La registrazione apre un segmento nuovo ogni 5 minuti: senza unirli, 90 minuti diventerebbero 18 file.
 */
export async function convertWebmLesson(blobs: Blob[], opts: ConvertOptions = {}): Promise<ConvertedAudio> {
  if (!hasDecoder()) throw new Error(NO_WEBCODECS)
  return webmToNotebook(blobs, opts)
}

async function openDecoder(track: WebmTrack, output: (d: AudioData) => void, error: (e: unknown) => void): Promise<AudioDecoder> {
  if (track.codec !== 'A_OPUS') throw new Error(`Codec audio non supportato (${track.codec}): esporta solo il testo.`)
  const cfg: AudioDecoderConfig = { codec: 'opus', sampleRate: track.sampleRate, numberOfChannels: track.channels, description: track.codecPrivate }
  if (!(await AudioDecoder.isConfigSupported(cfg)).supported) throw new Error(NO_WEBCODECS)
  const dec = new AudioDecoder({ output, error })
  dec.configure(cfg)
  return dec
}

/** WebM/Opus (uno o più file in fila) → mono 16 kHz → AAC (o WAV), un pezzo alla volta: la memoria resta bassa anche con 2 ore. */
async function webmToNotebook(files: Blob[], opts: ConvertOptions): Promise<ConvertedAudio> {
  const aac = await aacSettings()
  const sink = aac ? aacSink(aac) : wavSink()
  const pcm: Float32Array<ArrayBuffer>[] = []
  let resampler: Resampler | null = null
  let failure: unknown = null
  let dec: AudioDecoder | null = null

  const onData = (d: AudioData) => {
    try {
      resampler ??= new Resampler(d.sampleRate, sink.sampleRate)
      pcm.push(resampler.push(toMono(d)))
    } catch (e) {
      failure = e
    } finally {
      d.close()
    }
  }
  const check = () => {
    opts.signal?.throwIfAborted()
    if (failure) throw new Error(`Decodifica audio non riuscita: ${failure instanceof Error ? failure.message : String(failure)}`)
  }
  const drain = async () => {
    for (const p of pcm.splice(0)) await sink.write(p)
  }

  try {
    let n = 0
    let lastYield = performance.now()
    // Byte dei file precedenti, per l'avanzamento complessivo.
    let before = 0
    for (const blob of files) {
      // Ogni file ha la sua traccia: un decoder per file, lo stesso ricampionatore e la stessa uscita.
      for await (const ev of demuxWebm(blob)) {
        check()
        if (ev.kind === 'track') {
          dec ??= await openDecoder(ev.track, onData, (e) => { failure = e })
          continue
        }
        if (!dec) continue
        dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: ev.timeUs, data: ev.data }))
        if (++n % 50) continue
        await waitQueue(dec, () => dec?.decodeQueueSize ?? 0, 20)
        await drain()
        opts.onProgress?.(before + ev.pos)
        if (performance.now() - lastYield > 40) {
          await tick()
          lastYield = performance.now()
        }
      }
      if (!dec) throw new Error('Nel file non c\'è audio Opus da convertire: esporta solo il testo.')
      await dec.flush()
      check()
      dec.close()
      dec = null
      await drain()
      before += blob.size
    }
    const tail = resampler as Resampler | null // assegnato nella callback del decoder
    if (tail) pcm.push(tail.flush())
    await drain()
    check()
    const blobs = await sink.finish()
    opts.onProgress?.(before)
    return { blobs, ext: sink.ext, mime: sink.mime }
  } finally {
    if (dec && dec.state !== 'closed') dec.close()
    sink.close()
  }
}
