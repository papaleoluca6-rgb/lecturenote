import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './schema'
import type { SpokenLang } from './schema'
import type { ChatProviderId } from '../lib/aiProviders'

/** Impostazioni tipizzate: chiave → tipo del valore. Usabili da tutte le feature. */
export interface SettingsMap {
  'apiKey.gemini': string
  'apiKey.qwen': string
  'apiKey.deepseek': string
  'apiKey.kimi': string
  'stt.provider': 'webspeech-device' | 'webspeech' | 'gemini-chunks'
  'translator.provider': 'chrome' | 'gemini' | ChatProviderId
  'ui.recordingDefaultLang': SpokenLang
}
export type SettingKey = keyof SettingsMap

export const DEFAULTS: SettingsMap = {
  'apiKey.gemini': '',
  'apiKey.qwen': '',
  'apiKey.deepseek': '',
  'apiKey.kimi': '',
  'stt.provider': 'webspeech-device',
  'translator.provider': 'chrome',
  'ui.recordingDefaultLang': 'zh+en',
}

/** Valori ammessi per le impostazioni a scelta: un valore sconosciuto (file vecchio o modificato) vale il default. */
const ALLOWED: { [K in SettingKey]?: readonly string[] } = {
  'stt.provider': ['webspeech-device', 'webspeech', 'gemini-chunks'],
  'translator.provider': ['chrome', 'gemini', 'qwen', 'deepseek', 'kimi'],
  'ui.recordingDefaultLang': ['zh', 'en', 'zh+en'],
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingsMap[K]> {
  const v = (await db.settings.get(key))?.value
  const allowed = ALLOWED[key]
  const ok = typeof v === 'string' && (allowed ? allowed.includes(v) : true)
  return ok ? (v as SettingsMap[K]) : DEFAULTS[key]
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingsMap[K]): Promise<void> {
  await db.settings.put({ key, value })
}

/** Valore corrente (reattivo); durante il caricamento restituisce il default. */
export function useSetting<K extends SettingKey>(key: K): SettingsMap[K] {
  const v = useLiveQuery(() => getSetting(key), [key])
  return v === undefined ? DEFAULTS[key] : v
}

/** Impostazione che contiene la chiave richiesta da un provider (undefined = nessuna chiave, es. Chrome offline). */
export function keyOf(provider: string): SettingKey | undefined {
  if (provider.startsWith('gemini')) return 'apiKey.gemini'
  const k = `apiKey.${provider}`
  return k in DEFAULTS ? (k as SettingKey) : undefined
}

/** Un provider a chiave senza la chiave (es. dopo un ripristino) vale come il default gratuito. */
export function effectiveProvider<K extends 'stt.provider' | 'translator.provider'>(key: K, value: SettingsMap[K], hasKey: (k: SettingKey) => boolean): SettingsMap[K] {
  const need = keyOf(value)
  return need && !hasKey(need) ? DEFAULTS[key] : value
}
