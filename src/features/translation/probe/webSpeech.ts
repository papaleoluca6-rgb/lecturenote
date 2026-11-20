import { deviceSpeechAvailable } from '../../../db/settings'

// Web Speech API (Chrome): usa i server Google, quindi in Cina serve la VPN.
// Nota: non riceve lo stream, apre il microfono da sola → è proprio il conflitto da misurare su Android.

interface SRResult { isFinal: boolean; 0: { transcript: string } }
interface SREvent extends Event { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SRErrorEvent extends Event { error: string }
interface SR {
  lang: string
  continuous: boolean
  interimResults: boolean
  /** Chrome recente: riconoscimento sul dispositivo, senza server Google. */
  processLocally?: boolean
  onstart: (() => void) | null
  onresult: ((e: SREvent) => void) | null
  onerror: ((e: SRErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type SRCtor = new () => SR

function ctor(): SRCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}
export const webSpeechAvailable = () => !!ctor()

const ERR: Record<string, string> = {
  network: 'server Google non raggiungibile',
  'not-allowed': 'microfono negato',
  'service-not-allowed': 'servizio non consentito',
  'no-speech': 'nessun parlato rilevato',
  'audio-capture': 'microfono occupato o assente',
  aborted: 'interrotto',
  'language-not-supported': 'lingua non supportata',
  'local-unsupported': 'riconoscimento sul dispositivo assente in questo Chrome: userebbe i server Google',
}
/** Errori dopo cui riprovare non serve: ci si ferma. */
const FATAL = ['not-allowed', 'service-not-allowed', 'language-not-supported']
export const wsErrorText = (code: string) => `${code} (${ERR[code] ?? 'errore'})`

export interface WsHandlers {
  onState(s: string): void
  onInterim(text: string): void
  /** recMs = ms dal primo testo provvisorio della frase alla frase finale (0 = nessun provvisorio). */
  onFinal(text: string, recMs: number): void
  onError(code: string): void
  onRestart(): void
}

/** Riconoscimento continuo che si riavvia da solo (Chrome Android si ferma dopo ogni pausa). */
export class WebSpeechLive {
  private on = true
  /** Errori di fila (rete senza VPN, microfono occupato, …): senza attesa si riproverebbe ogni 0,3 s all'infinito. */
  private fails = 0
  private restartTimer = 0
  private sr: SR | null = null
  private firstAt = new Map<number, number>()
  private lang: string
  private local: boolean
  private h: WsHandlers

  constructor(lang: string, local: boolean, h: WsHandlers) {
    this.lang = lang
    this.local = local
    this.h = h
    const C = ctor()
    if (!C) h.onError('non supportato da questo browser')
    // Su Chrome vecchio processLocally si ignora in silenzio e l'audio va a Google: meglio dirlo e non partire.
    else if (local && !deviceSpeechAvailable()) h.onError('local-unsupported')
    else this.open(C)
  }

  private open(C: SRCtor) {
    const sr = new C()
    sr.lang = this.lang
    sr.continuous = true
    sr.interimResults = true
    if (this.local) sr.processLocally = true
    sr.onstart = () => this.h.onState('in ascolto')
    sr.onresult = (e) => {
      this.fails = 0
      const now = performance.now()
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const text = r[0].transcript.trim()
        const first = this.firstAt.get(i)
        if (first === undefined) this.firstAt.set(i, now)
        if (!r.isFinal) this.h.onInterim(text)
        else if (text) this.h.onFinal(text, first === undefined ? 0 : Math.round(now - first))
      }
    }
    sr.onerror = (e) => {
      this.h.onError(e.error)
      if (e.error !== 'no-speech' && e.error !== 'aborted') this.fails++
      if (FATAL.includes(e.error)) this.on = false
    }
    sr.onend = () => {
      this.firstAt.clear()
      if (!this.on) return this.h.onState('fermo')
      this.h.onRestart()
      // Dopo un errore si aspetta un po' di più (1, 2, 4, poi 8 s): microfono e batteria restano liberi,
      // e quando la VPN o il microfono tornano si riparte entro pochi secondi.
      const wait = this.fails ? Math.min(8000, 1000 * 2 ** (this.fails - 1)) : 300
      this.restartTimer = window.setTimeout(() => this.on && this.open(C), wait)
    }
    this.sr = sr
    sr.start()
  }

  stop() {
    this.on = false
    window.clearTimeout(this.restartTimer)
    this.sr?.stop()
    this.h.onState('fermo')
  }
}

export interface QuickResult { ok: boolean | null; ms: number; detail: string }

/** Test di raggiungibilità: ok solo se arriva testo (bisogna parlare durante il test). */
export function testWebSpeech(lang: string, local = false): Promise<QuickResult> {
  return new Promise((resolve) => {
    const C = ctor()
    if (!C) return resolve({ ok: false, ms: 0, detail: 'Web Speech non disponibile in questo browser' })
    if (local && !deviceSpeechAvailable()) return resolve({ ok: false, ms: 0, detail: wsErrorText('local-unsupported') })
    const t0 = performance.now()
    const sr = new C()
    sr.lang = lang
    sr.interimResults = true
    if (local) sr.processLocally = true
    let done = false
    const finish = (ok: boolean | null, detail: string) => {
      if (done) return
      done = true
      clearTimeout(timer)
      sr.abort()
      resolve({ ok, ms: Math.round(performance.now() - t0), detail })
    }
    sr.onresult = (e) => finish(true, `testo ricevuto: «${e.results[e.resultIndex][0].transcript}»`)
    sr.onerror = (e) => finish(e.error === 'no-speech' ? null : false, wsErrorText(e.error))
    sr.onend = () => finish(null, 'terminato senza testo né errori')
    const timer = window.setTimeout(() => finish(null, 'nessuna risposta in 12 s'), 12000)
    sr.start()
  })
}
