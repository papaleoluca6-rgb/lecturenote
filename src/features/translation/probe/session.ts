import { detectLang } from '../../../lib/detectLang'
import { BlockRecorder, blobToWav16k } from './audio'
import { providerLabel, type AsrProviderId, type ProbeConfig, type TranslatorId } from './config'
import type { Phrase, SessionSummary } from './log'
import { transcribe, translate } from './providers'
import { WebSpeechLive, wsErrorText } from './webSpeech'

// Sessione dal vivo: MediaRecorder (come nella registrazione vera) + Web Speech e/o AI su blocchi,
// ogni frase riconosciuta viene tradotta dai traduttori scelti misurando i millisecondi.

export interface LiveOptions {
  wsLang: '' | 'zh-CN' | 'en-US'
  /** Web Speech sul dispositivo (processLocally), senza server Google. */
  wsLocal: boolean
  ai: AsrProviderId[]
  blockSec: number
  translators: TranslatorId[]
  vpn: boolean
}

export interface LiveStatus {
  recMime: string
  recChunks: number
  recBytes: number
  level: number
  levelMax: number
  ws: string
  wsInterim: string
  wsFinals: number
  wsRestarts: number
  wsErrors: string[]
  aiSent: number
  aiOk: number
  aiErrors: string[]
}

const fresh = (): LiveStatus => ({
  recMime: '', recChunks: 0, recBytes: 0, level: 0, levelMax: 0,
  ws: 'spento', wsInterim: '', wsFinals: 0, wsRestarts: 0, wsErrors: [], aiSent: 0, aiOk: 0, aiErrors: [],
})

export class ProbeSession {
  status = fresh()
  private t0 = performance.now()
  private n = 0
  private stream: MediaStream | null = null
  private rec: MediaRecorder | null = null
  private chunks: Blob[] = []
  private ws: WebSpeechLive | null = null
  private blocks: BlockRecorder | null = null
  private ctx: AudioContext | null = null
  private meter = 0
  private opts: LiveOptions
  private cfg: ProbeConfig
  private onStatus: (s: LiveStatus) => void
  private onPhrase: (p: Phrase) => void

  constructor(opts: LiveOptions, cfg: ProbeConfig, onStatus: (s: LiveStatus) => void, onPhrase: (p: Phrase) => void) {
    this.opts = opts
    this.cfg = cfg
    this.onStatus = onStatus
    this.onPhrase = onPhrase
  }

  private set(patch: Partial<LiveStatus>) {
    this.status = { ...this.status, ...patch }
    this.onStatus(this.status)
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    })
    this.stream = stream
    const rec = new MediaRecorder(stream)
    rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data)
      this.set({ recChunks: this.status.recChunks + 1, recBytes: this.status.recBytes + e.data.size })
    }
    rec.start(1000)
    this.rec = rec
    this.set({ recMime: rec.mimeType })
    this.startMeter(stream)
    const ws = this.opts.wsLang
    if (ws) {
      this.ws = new WebSpeechLive(ws, this.opts.wsLocal, {
        onState: (s) => this.set({ ws: s }),
        onInterim: (t) => this.set({ wsInterim: t }),
        onFinal: (t, ms) => {
          this.set({ wsFinals: this.status.wsFinals + 1, wsInterim: '' })
          this.addPhrase(`Web Speech ${ws}${this.opts.wsLocal ? ' dispositivo' : ''}`, detectLang(t), t, ms)
        },
        onError: (c) => this.set({ wsErrors: [...this.status.wsErrors, wsErrorText(c)].slice(-5) }),
        onRestart: () => this.set({ wsRestarts: this.status.wsRestarts + 1 }),
      })
    }
    if (this.opts.ai.length) this.blocks = new BlockRecorder(stream, this.opts.blockSec, (b, end) => void this.onBlock(b, end))
  }

  private startMeter(stream: MediaStream) {
    const ctx = new AudioContext()
    const an = ctx.createAnalyser()
    ctx.createMediaStreamSource(stream).connect(an)
    const buf = new Float32Array(an.fftSize)
    void ctx.resume()
    this.ctx = ctx
    this.meter = window.setInterval(() => {
      an.getFloatTimeDomainData(buf)
      const level = Math.sqrt(buf.reduce((a, v) => a + v * v, 0) / buf.length)
      this.set({ level, levelMax: Math.max(this.status.levelMax, level) })
    }, 250)
  }

  private async onBlock(blob: Blob, endAt: number) {
    if (blob.size < 1000) return
    let wav: Blob
    try {
      wav = await blobToWav16k(blob)
    } catch (e) {
      return this.set({ aiErrors: [...this.status.aiErrors, `conversione audio: ${(e as Error).message}`].slice(-5) })
    }
    await Promise.all(this.opts.ai.map(async (id) => {
      this.set({ aiSent: this.status.aiSent + 1 })
      try {
        const text = await transcribe(id, this.cfg, wav)
        this.set({ aiOk: this.status.aiOk + 1 })
        if (text) this.addPhrase(`${providerLabel(id)} audio auto`, detectLang(text), text, Math.round(performance.now() - endAt))
      } catch (e) {
        this.set({ aiErrors: [...this.status.aiErrors, `${providerLabel(id)}: ${(e as Error).message}`].slice(-5) })
      }
    }))
  }

  private addPhrase(stt: string, lang: 'zh' | 'en', text: string, recMs: number) {
    const p: Phrase = {
      id: `${Date.now()}-${this.n++}`, vpn: this.opts.vpn, at: Math.round((performance.now() - this.t0) / 1000),
      stt, lang, text, recMs, tr: {},
    }
    this.onPhrase(p)
    for (const id of this.opts.translators) {
      const t = performance.now()
      translate(id, this.cfg, text, lang)
        .then((out) => ({ ms: Math.round(performance.now() - t), text: out }))
        .catch((e: Error) => ({ ms: Math.round(performance.now() - t), error: e.message }))
        .then((r) => {
          p.tr = { ...p.tr, [id]: r }
          this.onPhrase({ ...p })
        })
    }
  }

  /** Ferma tutto e restituisce il riepilogo e l'audio registrato (per riascoltarlo). */
  async stop(): Promise<{ summary: SessionSummary; audio: Blob }> {
    this.ws?.stop()
    this.blocks?.stop()
    const rec = this.rec
    if (rec && rec.state !== 'inactive') await new Promise((ok) => { rec.onstop = ok; rec.stop() })
    this.stream?.getTracks().forEach((t) => t.stop())
    clearInterval(this.meter)
    void this.ctx?.close()
    const s = this.status
    const o = this.opts
    const setup = [o.wsLang && `Web Speech ${o.wsLang}${o.wsLocal ? ' dispositivo' : ''}`, ...o.ai.map((a) => `${providerLabel(a)} audio ${o.blockSec}s`)]
      .filter(Boolean).join(' + ') || 'solo registrazione'
    const verdict = s.recChunks === 0 ? 'KO: MediaRecorder non produce audio'
      : s.levelMax < 0.01 ? 'KO: audio registrato muto (microfono rubato?)'
      : o.wsLang && s.wsFinals === 0 ? 'Registra, ma Web Speech senza testo'
      : 'OK: registrazione e riconoscimento insieme'
    const summary: SessionSummary = {
      at: Date.now(), vpn: o.vpn, setup, sec: Math.round((performance.now() - this.t0) / 1000),
      recChunks: s.recChunks, levelMax: Math.round(s.levelMax * 1000) / 1000, wsFinals: s.wsFinals,
      wsRestarts: s.wsRestarts, wsErrors: s.wsErrors.join('; '), ai: o.ai.length ? `${s.aiOk}/${s.aiSent} ok` : '—', verdict,
    }
    return { summary, audio: new Blob(this.chunks, { type: this.rec?.mimeType || 'audio/webm' }) }
  }
}
