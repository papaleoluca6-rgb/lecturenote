import type { Lang, Sec } from '../../db/schema'

// Traduttore in tempo reale: cinese → italiano e inglese → italiano.
// Due stadi separati e intercambiabili, così si può cambiare servizio
// (es. con o senza VPN in Cina) senza toccare la UI.

/** Frase riconosciuta dal parlato. `final=false` = provvisoria, verrà sostituita. */
export interface RecognizedChunk {
  ts: Sec
  text: string
  lang: Lang
  final: boolean
}

/** Stadio 1: audio del microfono → testo nella lingua del docente. */
export interface SpeechToTextProvider {
  readonly id: string
  readonly label: string
  /** true se funziona senza connessione. */
  readonly offline: boolean
  start(lang: Exclude<Lang, 'it'>, stream: MediaStream, onChunk: (c: RecognizedChunk) => void): Promise<void>
  stop(): Promise<void>
}

/** Stadio 2: testo (zh/en) → italiano. `context` = frasi precedenti e glossario del corso. */
export interface TranslatorProvider {
  readonly id: string
  readonly label: string
  translate(text: string, from: Exclude<Lang, 'it'>, context?: string): Promise<string>
}
