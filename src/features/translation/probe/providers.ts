import { chat, gemini } from '../../../lib/ai'
import { toBase64 } from './audio'
import type { AsrProviderId, ProbeConfig, TranslatorId } from './config'
import { translateOnDevice } from './onDevice'
import { isChatProvider } from '../../../lib/aiProviders'

// Traduzione e riconoscimento: Chrome offline di base, Gemini solo se l'utente ha messo la sua chiave.

const TR_SYSTEM = (from: 'zh' | 'en') =>
  `Sei l'interprete di una lezione universitaria. Traduci in italiano il testo ${from === 'zh' ? 'cinese' : 'inglese'} ` +
  `(può contenere anche parole nell'altra lingua). Mantieni i termini tecnici. Rispondi solo con la traduzione.`

const ASR_PROMPT =
  'Trascrivi esattamente il parlato di questo audio di una lezione. Il docente può alternare cinese e inglese: ' +
  'scrivi ogni frase nella lingua in cui è pronunciata (cinese in caratteri semplificati), senza tradurre. ' +
  'Se non c\'è parlato rispondi con una stringa vuota. Rispondi solo con la trascrizione.'

export async function translate(id: TranslatorId, cfg: ProbeConfig, text: string, from: 'zh' | 'en'): Promise<string> {
  if (id === 'chrome') return translateOnDevice(text, from)
  return isChatProvider(id) ? chat(id, cfg.keys[id], text, TR_SYSTEM(from)) : gemini(cfg.keys.gemini, [{ text }], TR_SYSTEM(from), cfg.geminiModel)
}

/** Riconoscimento con lingua automatica su un blocco WAV. */
export async function transcribe(_id: AsrProviderId, cfg: ProbeConfig, wav: Blob): Promise<string> {
  const b64 = await toBase64(wav)
  return gemini(cfg.keys.gemini, [{ text: ASR_PROMPT }, { inline_data: { mime_type: 'audio/wav', data: b64 } }], undefined, cfg.geminiModel)
}
