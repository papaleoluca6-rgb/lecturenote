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

/** Decodifica un file audio in mono a 16 kHz. */
export async function decodeFile(file: Blob): Promise<Float32Array> {
  const ctx = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(await file.arrayBuffer())
  } finally {
    void ctx.close()
  }
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * RATE)), RATE)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  return (await off.startRendering()).getChannelData(0)
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
