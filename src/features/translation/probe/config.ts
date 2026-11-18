import { db } from '../../../db/schema'

// Configurazione della prova tecnica. Regola: tutto gratuito e funzionante senza chiavi.
// Le AI esterne sono solo un'aggiunta facoltativa: chiave in db.settings (apiKey.<provider>), mai nel codice.

/** Servizi AI facoltativi (con piano gratuito). Per aggiungerne uno: qui, in providers.ts e in connTests.ts. */
export type ProviderId = 'gemini'
export type AsrProviderId = 'gemini'

export const PROVIDERS: { id: ProviderId; label: string }[] = [{ id: 'gemini', label: 'Gemini (facoltativo)' }]

/** Traduttori: 'chrome' = Translator API di Chrome, offline sul tablet, senza AI esterne né chiavi. */
export type TranslatorId = 'chrome' | ProviderId
export const TRANSLATORS: { id: TranslatorId; label: string }[] = [{ id: 'chrome', label: 'Chrome offline' }, ...PROVIDERS]

export const providerLabel = (id: TranslatorId) => TRANSLATORS.find((p) => p.id === id)?.label ?? id

export interface ProbeConfig {
  keys: Record<ProviderId, string>
  geminiModel: string
}

export const DEFAULT_CONFIG: ProbeConfig = {
  keys: { gemini: '' },
  geminiModel: 'gemini-2.5-flash-lite',
}

const keyName = (id: ProviderId) => `apiKey.${id}`

export async function loadConfig(): Promise<ProbeConfig> {
  const [opts, ...keys] = await db.settings.bulkGet(['probe.config', ...PROVIDERS.map((p) => keyName(p.id))])
  const saved = opts?.value as Partial<ProbeConfig> | undefined
  const cfg: ProbeConfig = { ...DEFAULT_CONFIG, geminiModel: saved?.geminiModel ?? DEFAULT_CONFIG.geminiModel, keys: { ...DEFAULT_CONFIG.keys } }
  PROVIDERS.forEach((p, i) => (cfg.keys[p.id] = String(keys[i]?.value ?? '')))
  return cfg
}

export async function saveConfig(cfg: ProbeConfig): Promise<void> {
  const { keys, ...opts } = cfg
  await db.settings.bulkPut([
    { key: 'probe.config', value: opts },
    ...PROVIDERS.map((p) => ({ key: keyName(p.id), value: keys[p.id].trim() })),
  ])
}
