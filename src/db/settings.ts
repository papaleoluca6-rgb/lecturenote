import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './schema'
import type { SpokenLang } from './schema'

/** Impostazioni tipizzate: chiave → tipo del valore. Usabili da tutte le feature. */
export interface SettingsMap {
  'apiKey.gemini': string
  'stt.provider': 'webspeech-device' | 'webspeech' | 'gemini-chunks'
  'translator.provider': 'chrome' | 'gemini'
  'ui.recordingDefaultLang': SpokenLang
}
export type SettingKey = keyof SettingsMap

export const DEFAULTS: SettingsMap = {
  'apiKey.gemini': '',
  'stt.provider': 'webspeech-device',
  'translator.provider': 'chrome',
  'ui.recordingDefaultLang': 'zh+en',
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingsMap[K]> {
  const row = await db.settings.get(key)
  return row ? (row.value as SettingsMap[K]) : DEFAULTS[key]
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingsMap[K]): Promise<void> {
  await db.settings.put({ key, value })
}

/** Valore corrente (reattivo); durante il caricamento restituisce il default. */
export function useSetting<K extends SettingKey>(key: K): SettingsMap[K] {
  const v = useLiveQuery(() => getSetting(key), [key])
  return v === undefined ? DEFAULTS[key] : v
}

/** Un provider Gemini senza chiave (es. dopo un ripristino) vale come il default gratuito. */
export function effectiveProvider<K extends 'stt.provider' | 'translator.provider'>(key: K, value: SettingsMap[K], hasKey: boolean): SettingsMap[K] {
  return !hasKey && value.startsWith('gemini') ? DEFAULTS[key] : value
}
