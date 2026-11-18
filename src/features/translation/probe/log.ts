import { db } from '../../../db/schema'
import type { TranslatorId } from './config'

// Registro dei risultati della prova: sopravvive a un ricaricamento della pagina (db.settings 'probe.log').

export interface ConnResult {
  at: number
  vpn: boolean
  target: string
  ok: boolean | null
  ms: number
  detail: string
}

export interface TrResult {
  ms?: number
  text?: string
  error?: string
}

export interface Phrase {
  id: string
  vpn: boolean
  /** Secondi dall'inizio della sessione di prova. */
  at: number
  stt: string
  lang: 'zh' | 'en'
  text: string
  recMs: number
  tr: Partial<Record<TranslatorId, TrResult>>
}

export interface SessionSummary {
  at: number
  vpn: boolean
  setup: string
  sec: number
  recChunks: number
  levelMax: number
  wsFinals: number
  wsRestarts: number
  wsErrors: string
  ai: string
  verdict: string
}

export interface ProbeLog {
  conn: ConnResult[]
  sessions: SessionSummary[]
  phrases: Phrase[]
}

export const EMPTY_LOG: ProbeLog = { conn: [], sessions: [], phrases: [] }

export async function loadLog(): Promise<ProbeLog> {
  const row = await db.settings.get('probe.log')
  return { ...EMPTY_LOG, ...(row?.value as Partial<ProbeLog> | undefined) }
}

export const saveLog = (log: ProbeLog) => db.settings.put({ key: 'probe.log', value: log })
