import { detectLang } from '../../../lib/detectLang'
import { decodeFile, fileSource, micSource, type Source } from './audioSource'
import type { AsrModel } from './catalog'
import { OfflineAsr, OfflineMt, type Ready } from './engines'

// Una prova completa: ascolto (sherpa-onnx) → frase → traduzione (Bergamot), con i tempi misurati.

export interface TestPhrase {
  id: number
  /** Secondi di audio a cui la frase è finita. */
  at: number
  lang: 'zh' | 'en'
  text: string
  en?: string
  it?: string
  msEn?: number
  msIt?: number
}

export interface TestState {
  phase: 'idle' | 'loading' | 'ready' | 'running' | 'done' | 'error'
  message: string
  asrLoad?: Ready
  mtLoad?: Ready
  partial: string
  phrases: TestPhrase[]
  /** Secondi di audio inviati e già elaborati. */
  sentSec: number
  doneSec: number
  /** Tempo di calcolo totale dell'ascolto (ms). */
  asrMs: number
  /** Ritardo massimo del testo rispetto alla voce (s). */
  maxLag: number
  mtHeapMB?: number
}

export const INITIAL: TestState = { phase: 'idle', message: '', partial: '', phrases: [], sentSec: 0, doneSec: 0, asrMs: 0, maxLag: 0 }

export class OfflineTest {
  private asr: OfflineAsr | null = null
  private mt: OfflineMt | null = null
  private src: Source | null = null
  private s: TestState = INITIAL
  private readonly model: AsrModel
  private readonly onState: (s: TestState) => void

  constructor(model: AsrModel, onState: (s: TestState) => void) {
    this.model = model
    this.onState = onState
  }

  private set(patch: Partial<TestState>) {
    this.s = { ...this.s, ...patch }
    this.onState(this.s)
  }

  private fail = (msg: string) => this.set({ phase: 'error', message: msg })

  /** Carica i due motori con i modelli già scaricati e misura tempi e memoria. */
  async load(): Promise<void> {
    this.set({ ...INITIAL, phase: 'loading', message: 'Carico il riconoscimento vocale…' })
    try {
      this.asr = new OfflineAsr()
      const asrLoad = await this.asr.start(this.model, {
        partial: (text) => this.set({ partial: text }),
        final: (text) => this.onFinal(text),
        done: (end, ms) => {
          const lag = this.s.sentSec - end
          this.set({ doneSec: end, asrMs: this.s.asrMs + ms, maxLag: Math.max(this.s.maxLag, lag) })
        },
        ended: () => this.set({ phase: 'done', message: 'Prova finita.', partial: '' }),
        error: this.fail,
      })
      this.set({ asrLoad, message: 'Carico la traduzione…' })
      this.mt = new OfflineMt()
      const mtLoad = await this.mt.start(this.fail)
      this.set({ phase: 'ready', mtLoad, mtHeapMB: mtLoad.heapMB, message: 'Pronto: scegli microfono o file.' })
    } catch (e) {
      this.fail(`Caricamento non riuscito: ${(e as Error).message}`)
    }
  }

  private feed = (samples: Float32Array, end: number) => {
    this.set({ sentSec: end })
    this.asr?.feed(samples, end)
  }

  async mic(): Promise<void> {
    this.set({ ...this.clean(), phase: 'running', message: 'Ascolto dal microfono…' })
    this.src = await micSource(this.feed)
  }

  async file(f: File): Promise<void> {
    this.set({ ...this.clean(), phase: 'running', message: `Leggo ${f.name}…` })
    const samples = await decodeFile(f)
    this.set({ message: `Faccio scorrere ${f.name} a velocità reale (${Math.round(samples.length / 16000)} s)…` })
    this.src = fileSource(samples, this.feed, () => this.asr?.end())
  }

  stop(): void {
    this.src?.stop()
    this.src = null
    this.asr?.end()
  }

  dispose(): void {
    this.src?.stop()
    this.asr?.dispose()
    this.mt?.dispose()
  }

  private clean(): Partial<TestState> {
    return { partial: '', phrases: [], sentSec: 0, doneSec: 0, asrMs: 0, maxLag: 0 }
  }

  private onFinal(raw: string) {
    // <unk> = suono che il modello non sa scrivere (es. inglese con il modello solo cinese): non va tradotto.
    const text = raw.replace(/<unk>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text) return
    const lang = this.model.langs === 'zh+en' ? detectLang(text) : this.model.langs === 'en' ? 'en' : 'zh'
    const p: TestPhrase = { id: this.s.phrases.length, at: this.s.doneSec, lang, text }
    this.set({ partial: '', phrases: [...this.s.phrases, p] })
    void this.mt?.translate(text, lang).then((t) => {
      this.set({
        mtHeapMB: t.heapMB,
        phrases: this.s.phrases.map((x) => (x.id === p.id ? { ...x, en: t.en, it: t.it, msEn: t.msEn, msIt: t.msIt } : x)),
      })
    })
  }
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0)

/** Testo da copiare e mandare: tutti i numeri della prova e qualche frase. */
export function summary(model: AsrModel, s: TestState): string {
  const rtf = s.doneSec ? s.asrMs / 1000 / s.doneSec : 0
  const done = s.phrases.filter((p) => p.it !== undefined)
  const zh = done.filter((p) => p.lang === 'zh')
  const lines = [
    `Prova offline LectureNote — ${new Date().toLocaleString('it-IT')}`,
    `Browser: ${navigator.userAgent}`,
    `Ascolto: ${model.label}; caricamento ${s.asrLoad?.ms ?? '?'} ms (modello ${s.asrLoad?.modelMs ?? '?'} ms), memoria ${s.asrLoad?.heapMB ?? '?'} MB`,
    `Traduzione: caricamento ${s.mtLoad?.ms ?? '?'} ms, memoria ${s.mtHeapMB ?? '?'} MB`,
    `Audio elaborato: ${s.doneSec.toFixed(1)} s; fattore tempo reale ${rtf.toFixed(2)} (sotto 1 = regge); ritardo massimo ${s.maxLag.toFixed(1)} s`,
    `Frasi: ${s.phrases.length}; tradotte ${done.length}; tempo medio cinese→inglese ${avg(zh.map((p) => p.msEn ?? 0))} ms, inglese→italiano ${avg(done.map((p) => p.msIt ?? 0))} ms`,
    '',
    ...s.phrases.slice(0, 15).map((p) => `[${p.at.toFixed(0)} s, ${p.lang}] ${p.text}\n   → ${p.it ?? '(non tradotta)'}`),
  ]
  return lines.join('\n')
}
