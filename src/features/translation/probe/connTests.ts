import { silenceWav } from './audio'
import type { ProbeConfig } from './config'
import { AVAIL_TEXT, detectOnDevice, detectorAvailability, getTranslator, localSpeech, translatorAvailability, withTimeout } from './onDevice'
import { transcribe, translate } from './providers'
import { testWebSpeech, type QuickResult } from './webSpeech'

// "Testa connessione": una chiamata minima per ciascun servizio candidato, con tempo ed errore leggibile.

export const CONN_TESTS = [
  { id: 'chrome-zh', label: 'Chrome offline cinese→italiano' },
  { id: 'chrome-en', label: 'Chrome offline inglese→italiano' },
  { id: 'chrome-detect', label: 'Chrome offline rileva lingua' },
  { id: 'ws-local-zh', label: 'Web Speech sul dispositivo zh-CN' },
  { id: 'ws-local-en', label: 'Web Speech sul dispositivo en-US' },
  { id: 'ws-zh', label: 'Web Speech zh-CN (parla!)' },
  { id: 'ws-en', label: 'Web Speech en-US (parla!)' },
  { id: 'gemini-tr', label: 'Gemini traduzione (facoltativo)' },
  { id: 'gemini-asr', label: 'Gemini audio (facoltativo)' },
] as const

export type ConnTestId = (typeof CONN_TESTS)[number]['id']

const SAMPLE = { zh: '同学们好，今天我们讲机器学习。', en: 'Good morning everyone, today we talk about machine learning.' }
const MIXED = '今天我们讲 gradient descent 的基本原理。'
const noApi = 'API assente in questo Chrome (serve una versione più recente o non è supportata su Android)'

async function chromeTranslate(from: 'zh' | 'en', progress: (s: string) => void): Promise<string> {
  const before = await translatorAvailability(from)
  if (before === 'no-api') throw new Error(noApi)
  if (before === 'unavailable') throw new Error(`Coppia ${from}→it ${AVAIL_TEXT.unavailable}`)
  let pct = -1
  if (before !== 'available') progress('Scarico modello…')
  const t = await withTimeout(getTranslator(from, (p) => progress(`Scarico modello ${(pct = p)}%`)), 600, 'Scaricamento modello')
  const out = await withTimeout(t.translate(SAMPLE[from]), 30, 'Traduzione')
  return `prima: ${AVAIL_TEXT[before]}${pct >= 0 ? ` · scaricato ${pct}%` : ''} · «${out}»`
}

async function chromeDetect(): Promise<string> {
  const a = await detectorAvailability()
  if (a === 'no-api') throw new Error(noApi)
  if (a === 'unavailable') throw new Error(AVAIL_TEXT.unavailable)
  const r = await withTimeout(detectOnDevice(MIXED), 120, 'Rilevamento lingua')
  return `prima: ${AVAIL_TEXT[a]} · «${MIXED}» → ${r?.lang} (${r?.confidence})`
}

async function speechLocal(lang: string, progress: (s: string) => void): Promise<QuickResult> {
  progress('Controllo / installo pacchetto…')
  const a = await localSpeech(lang, true)
  if (a !== 'available') {
    return { ok: false, ms: 0, detail: a === 'no-api' ? noApi : `pacchetto ${lang}: ${AVAIL_TEXT[a]}` }
  }
  const r = await testWebSpeech(lang, true)
  return { ...r, detail: `pacchetto installato · ${r.detail}` }
}

export async function runConnTest(id: ConnTestId, cfg: ProbeConfig, progress: (s: string) => void = () => {}): Promise<QuickResult> {
  if (id === 'ws-zh') return testWebSpeech('zh-CN')
  if (id === 'ws-en') return testWebSpeech('en-US')
  const t0 = performance.now()
  try {
    if (id === 'ws-local-zh') return await speechLocal('zh-CN', progress)
    if (id === 'ws-local-en') return await speechLocal('en-US', progress)
    let out: string
    if (id === 'chrome-zh' || id === 'chrome-en') out = await chromeTranslate(id === 'chrome-zh' ? 'zh' : 'en', progress)
    else if (id === 'chrome-detect') out = await chromeDetect()
    else if (id === 'gemini-asr') {
      out = await transcribe('gemini', cfg, silenceWav(1))
      out = `risposta ricevuta (audio di silenzio): «${out}»`
    } else {
      out = `«${await translate('gemini', cfg, SAMPLE.zh, 'zh')}»`
    }
    return { ok: true, ms: Math.round(performance.now() - t0), detail: out }
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t0), detail: (e as Error).message }
  }
}
