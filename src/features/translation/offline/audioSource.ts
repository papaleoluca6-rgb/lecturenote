// Sorgenti di audio per la prova offline: microfono dal vivo, oppure un file (es. una lezione registrata)
// fatto scorrere a velocità reale, così il ritardo misurato è quello che si avrebbe a lezione.

export const RATE = 16000
/** Pezzi da 0,25 s: abbastanza piccoli per vedere il testo crescere, abbastanza grandi da non sprecare messaggi. */
const CHUNK = RATE / 4

export type OnChunk = (samples: Float32Array, endSec: number) => void

export interface Source {
  stop(): void
}

/** Microfono a 16 kHz (Chrome ricampiona da solo). */
export async function micSource(onChunk: OnChunk): Promise<Source> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } })
  const ctx = new AudioContext({ sampleRate: RATE })
  const src = ctx.createMediaStreamSource(stream)
  // ScriptProcessor è vecchio ma semplice e presente ovunque: per una prova va bene.
  const proc = ctx.createScriptProcessor(4096, 1, 1)
  let sent = 0
  proc.onaudioprocess = (e) => {
    const data = new Float32Array(e.inputBuffer.getChannelData(0))
    sent += data.length
    onChunk(data, sent / ctx.sampleRate)
  }
  src.connect(proc)
  proc.connect(ctx.destination)
  return {
    stop() {
      proc.disconnect()
      src.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
    },
  }
}

/** Decodifica un audio (file intero) in mono a 16 kHz. Usata anche dalla prova tecnica. */
export async function decode16k(blob: Blob, maxSec = Infinity): Promise<Float32Array> {
  const ctx = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
  } finally {
    void ctx.close()
  }
  if (decoded.duration > maxSec) throw new Error(TOO_LONG)
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * RATE)), RATE)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  return (await off.startRendering()).getChannelData(0)
}

// Il file si decodifica tutto in memoria (≈ 0,4 MB al secondo prima di ricampionare): con 3 GB di RAM meglio un pezzo breve.
const MAX_MB = 25
const MAX_MIN = 15
const TOO_LONG = `File troppo lungo per la prova (massimo ${MAX_MIN} minuti): usa uno spezzone breve della lezione.`

/** Durata dai metadati, senza decodificare (NaN o Infinity se il file non la dice, come i webm del registratore). */
async function metaDuration(file: Blob): Promise<number> {
  const url = URL.createObjectURL(file)
  const a = new Audio()
  try {
    a.preload = 'metadata'
    a.src = url
    await new Promise((res, rej) => {
      a.onloadedmetadata = res
      a.onerror = rej
      window.setTimeout(res, 5000)
    })
    return a.duration
  } catch {
    return NaN
  } finally {
    a.removeAttribute('src')
    URL.revokeObjectURL(url)
  }
}

/** Decodifica un file per la prova, rifiutando quelli troppo grandi per la memoria del tablet. */
export async function decodeFile(file: Blob): Promise<Float32Array> {
  if (file.size > MAX_MB * 1048576) throw new Error(`File troppo grande per la prova (massimo ${MAX_MB} MB): usa uno spezzone breve della lezione.`)
  // I webm del registratore dicono durata «Infinity»: lì decide il controllo dopo la decodifica.
  const d = await metaDuration(file)
  if (Number.isFinite(d) && d > MAX_MIN * 60) throw new Error(TOO_LONG)
  return decode16k(file, MAX_MIN * 60)
}

/** Fa scorrere i campioni a velocità reale (un pezzo ogni 0,25 s); `onDone` alla fine. */
export function fileSource(samples: Float32Array, onChunk: OnChunk, onDone: () => void): Source {
  let pos = 0
  const timer = window.setInterval(() => {
    if (pos >= samples.length) {
      window.clearInterval(timer)
      return onDone()
    }
    const end = Math.min(samples.length, pos + CHUNK)
    onChunk(samples.slice(pos, end), end / RATE)
    pos = end
  }, (CHUNK / RATE) * 1000)
  return { stop: () => window.clearInterval(timer) }
}
