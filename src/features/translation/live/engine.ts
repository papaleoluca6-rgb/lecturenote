import { db, newId, type Id, type Lang, type Sec, type SpokenLang } from '../../../db/schema'
import { effectiveProvider, getSetting, type SettingKey, type SettingsMap } from '../../../db/settings'
import { detectLang } from '../../../lib/detectLang'
import { BlockRecorder, blobToWav16k } from '../probe/audio'
import { loadConfig, type ProbeConfig } from '../probe/config'
import { transcribe, translate } from '../probe/providers'
import { WebSpeechLive, wsErrorText } from '../probe/webSpeech'

// Traduttore live di una lezione: parlato → frase (Web Speech o Gemini a blocchi) → italiano.
// Ogni frase e ogni traduzione si salvano subito sulla timeline (db.transcript / db.translations).

const BLOCK_SEC = 8
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
      this.blocks = new BlockRecorder(stream, BLOCK_SEC, (b) => void this.onBlock(b, this.now() - BLOCK_SEC))
      return
    }
    this.ws = new WebSpeechLive(WS_LANG[this.spoken], this.setup.stt === 'webspeech-device', {
      onState: (s) => this.on.onState(s),
      onInterim: (t) => this.on.onInterim(t),
      onFinal: (t, ms) => {
        this.on.onInterim('')
        void this.addPhrase(t, Math.max(0, this.now() - ms / 1000 - 0.5), 'live')
      },
      onError: (c) => { if (c !== 'no-speech' && c !== 'aborted') this.on.onError(`Riconoscimento: ${wsErrorText(c)}`) },
      onRestart: () => {},
    })
  }

  stop(): void {
    this.ws?.stop()
    this.blocks?.stop()
    this.ws = null
    this.blocks = null
  }

  private async onBlock(blob: Blob, ts: Sec) {
    if (blob.size < 1000) return
    try {
      const text = await transcribe('gemini', this.setup.cfg, await blobToWav16k(blob))
      if (text) await this.addPhrase(text, Math.max(0, ts), 'ai')
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
    await db.transcript.add({ id, lessonId: this.lessonId, ts: at, lang, text, source })
    if (lang === 'it') return
    try {
      const out = await translate(this.setup.translator, this.setup.cfg, text, lang)
      if (out) await db.translations.add({ id: newId(), lessonId: this.lessonId, transcriptId: id, ts: at, from: lang, to: 'it', text: out })
    } catch (e) {
      this.on.onError(`Traduzione: ${(e as Error).message}`)
    }
  }
}
