import { db, newId, type Id, type Lang, type Sec, type SpokenLang } from '../../../db/schema'
import { effectiveProvider, getSetting, type SettingKey, type SettingsMap } from '../../../db/settings'
import { detectLang } from '../../../lib/detectLang'
import { BlockRecorder, blobToWav16kRms } from '../probe/audio'
import { loadConfig, type ProbeConfig } from '../probe/config'
import { transcribe, translate } from '../probe/providers'
import { WebSpeechLive, wsErrorText } from '../probe/webSpeech'

// Traduttore live di una lezione: parlato → frase (Web Speech o Gemini a blocchi) → italiano.
// Ogni frase e ogni traduzione si salvano subito sulla timeline (db.transcript / db.translations).

const BLOCK_SEC = 8
/** Sotto questo volume medio un blocco è silenzio: non si manda a Gemini (la quota gratuita è limitata). */
const MIN_RMS = 0.003
/** Frasi senza traduzione recuperate a ogni passata, per non mandare raffiche di richieste. */
const RETRY_MAX = 5
const HAS_WORDS = /\p{L}/u
const WS_LANG: Record<SpokenLang, string> = { zh: 'zh-CN', 'zh+en': 'zh-CN', en: 'en-US', it: 'it-IT' }

export interface LiveSetup {
  stt: SettingsMap['stt.provider']
  translator: SettingsMap['translator.provider']
  cfg: ProbeConfig
}

/** Provider scelti nelle impostazioni; quelli a chiave senza chiave valgono come i default gratuiti. */
export async function loadSetup(): Promise<LiveSetup> {
  const cfg = await loadConfig()
  const hasKey = (k: SettingKey) => !!cfg.keys[k.slice('apiKey.'.length) as keyof ProbeConfig['keys']]
  return {
    cfg,
    stt: effectiveProvider('stt.provider', await getSetting('stt.provider'), hasKey),
    translator: effectiveProvider('translator.provider', await getSetting('translator.provider'), hasKey),
  }
}

export interface LiveEvents {
  onState(s: string): void
  onInterim(text: string): void
  onError(msg: string): void
}

/** Una sessione di ascolto: si crea all'avvio (o alla ripresa dopo una pausa) e si ferma con stop(). */
export class LiveTranslator {
  private ws: WebSpeechLive | null = null
  private blocks: BlockRecorder | null = null
  private readonly lessonId: Id
  private readonly spoken: SpokenLang
  private readonly setup: LiveSetup
  private readonly now: () => Sec
  private readonly on: LiveEvents
  private stopped = false
  /** Frasi in traduzione adesso, o tradotte in vuoto: il recupero non le riprende. */
  private readonly busy = new Set<Id>()
  /** Possono esserci frasi della lezione senza traduzione (anche da sessioni precedenti). */
  private missing = true
  private retrying = false

  constructor(lessonId: Id, spoken: SpokenLang, setup: LiveSetup, now: () => Sec, on: LiveEvents) {
    this.lessonId = lessonId
    this.spoken = spoken
    this.setup = setup
    this.now = now
    this.on = on
  }

  start(stream: MediaStream | null): void {
    if (this.setup.stt === 'gemini-chunks') {
      if (!stream) return this.on.onError('Microfono non disponibile per Gemini.')
      this.on.onState('Gemini ascolta a blocchi di 8 s')
      // Durata reale del blocco: l'ultimo prima di una pausa è più corto di BLOCK_SEC.
      this.blocks = new BlockRecorder(stream, BLOCK_SEC, (b, _end, dur) => void this.onBlock(b, this.now() - dur))
      return
    }
    // Dopo stop() il vecchio riconoscitore manda ancora eventi: non devono sovrascrivere lo stato della nuova sessione.
    this.ws = new WebSpeechLive(WS_LANG[this.spoken], this.setup.stt === 'webspeech-device', {
      onState: (s) => { if (!this.stopped) this.on.onState(s) },
      onInterim: (t) => { if (!this.stopped) this.on.onInterim(t) },
      onFinal: (t, ms) => {
        if (!this.stopped) this.on.onInterim('')
        void this.addPhrase(t, Math.max(0, this.now() - ms / 1000 - 0.5), 'live')
      },
      onError: (c) => { if (!this.stopped && c !== 'no-speech' && c !== 'aborted') this.on.onError(`Riconoscimento: ${wsErrorText(c)}`) },
      onRestart: () => {},
    })
  }

  stop(): void {
    this.stopped = true
    this.ws?.stop()
    this.blocks?.stop()
    this.ws = null
    this.blocks = null
  }

  private async onBlock(blob: Blob, ts: Sec) {
    if (blob.size < 1000) return
    try {
      const { wav, rms } = await blobToWav16kRms(blob)
      if (rms < MIN_RMS) return
      const text = (await transcribe('gemini', this.setup.cfg, wav)).trim()
      this.on.onError('')
      // Al silenzio il modello può rispondere "" o sola punteggiatura: non è una frase.
      if (HAS_WORDS.test(text)) await this.addPhrase(text, Math.max(0, ts), 'ai')
    } catch (e) {
      this.on.onError(`Gemini: ${(e as Error).message}`)
    }
  }

  private langOf(text: string): Lang {
    return this.spoken === 'zh+en' ? detectLang(text) : this.spoken
  }

  private async addPhrase(text: string, ts: Sec, source: 'live' | 'ai') {
    const lang = this.langOf(text)
    const id = newId()
    const at = Math.round(ts * 100) / 100
    try {
      await db.transcript.add({ id, lessonId: this.lessonId, ts: at, lang, text, source })
    } catch (e) {
      return this.on.onError(`Salvataggio della frase: ${(e as Error).message}`)
    }
    if (lang !== 'it' && (await this.translateRow(id, at, lang, text))) void this.catchUp()
  }

  /** Traduce una frase già salvata. true se il servizio ha risposto. */
  private async translateRow(id: Id, ts: Sec, from: 'zh' | 'en', text: string): Promise<boolean> {
    this.busy.add(id)
    try {
      const out = await translate(this.setup.translator, this.setup.cfg, text, from)
      if (out) {
        await db.translations.add({ id: newId(), lessonId: this.lessonId, transcriptId: id, ts, from, to: 'it', text: out })
        this.busy.delete(id)
      }
      this.on.onError('')
      return true
    } catch (e) {
      this.busy.delete(id)
      this.missing = true
      this.on.onError(`Traduzione: ${(e as Error).message}`)
      return false
    }
  }

  /** Dopo un errore (VPN caduta, timeout) recupera le frasi rimaste senza traduzione, poche alla volta. */
  private async catchUp() {
    if (!this.missing || this.retrying || this.stopped) return
    this.retrying = true
    try {
      const done = new Set((await db.translations.where('lessonId').equals(this.lessonId).toArray()).map((t) => t.transcriptId))
      const todo = (await db.transcript.where('lessonId').equals(this.lessonId).toArray())
        .filter((r) => r.lang !== 'it' && !done.has(r.id) && !this.busy.has(r.id))
      this.missing = todo.length > RETRY_MAX
      for (const r of todo.slice(0, RETRY_MAX)) {
        if (r.lang === 'it' || !(await this.translateRow(r.id, r.ts, r.lang, r.text))) break
      }
    } catch (e) {
      this.on.onError(`Recupero traduzioni: ${(e as Error).message}`)
    } finally {
      this.retrying = false
    }
  }
}
