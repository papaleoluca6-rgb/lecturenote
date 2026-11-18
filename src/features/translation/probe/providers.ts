import { postJson } from './http'
import { toBase64 } from './audio'
import type { AsrProviderId, ProbeConfig, TranslatorId } from './config'
import { translateOnDevice } from './onDevice'

// Traduzione e riconoscimento: Chrome offline di base, Gemini solo se l'utente ha messo la sua chiave.

const TR_SYSTEM = (from: 'zh' | 'en') =>
  `Sei l'interprete di una lezione universitaria. Traduci in italiano il testo ${from === 'zh' ? 'cinese' : 'inglese'} ` +
  `(può contenere anche parole nell'altra lingua). Mantieni i termini tecnici. Rispondi solo con la traduzione.`

const ASR_PROMPT =
  'Trascrivi esattamente il parlato di questo audio di una lezione. Il docente può alternare cinese e inglese: ' +
  'scrivi ogni frase nella lingua in cui è pronunciata (cinese in caratteri semplificati), senza tradurre. ' +
  'Se non c\'è parlato rispondi con una stringa vuota. Rispondi solo con la trascrizione.'

interface GeminiPart { text?: string; inline_data?: { mime_type: string; data: string } }
interface GeminiResp { candidates?: { content?: { parts?: { text?: string }[] } }[] }

async function gemini(cfg: ProbeConfig, parts: GeminiPart[], system?: string): Promise<string> {
  const key = cfg.keys.gemini
  if (!key) throw new Error('Chiave Gemini non inserita (facoltativa: serve solo per questo confronto)')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.geminiModel}:generateContent`
  const r = await postJson<GeminiResp>(url, { 'x-goog-api-key': key }, {
    ...(system && { systemInstruction: { parts: [{ text: system }] } }),
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0 },
  })
  return (r.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
}

export async function translate(id: TranslatorId, cfg: ProbeConfig, text: string, from: 'zh' | 'en'): Promise<string> {
  return id === 'chrome' ? translateOnDevice(text, from) : gemini(cfg, [{ text }], TR_SYSTEM(from))
}

/** Riconoscimento con lingua automatica su un blocco WAV. */
export async function transcribe(_id: AsrProviderId, cfg: ProbeConfig, wav: Blob): Promise<string> {
  const b64 = await toBase64(wav)
  return gemini(cfg, [{ text: ASR_PROMPT }, { inline_data: { mime_type: 'audio/wav', data: b64 } }])
}
