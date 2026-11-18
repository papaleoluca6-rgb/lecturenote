import { postJson } from './http'
import { toBase64 } from './audio'
import type { AsrProviderId, ProbeConfig, TranslatorId } from './config'
import { translateOnDevice } from './onDevice'
import { CHAT_PROVIDERS, isChatProvider, type ChatProviderId } from '../../../lib/aiProviders'

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

interface ChatResp { choices?: { message?: { content?: string } }[] }

/** AI cinesi con API compatibile OpenAI (Qwen, DeepSeek, Kimi). */
async function chat(id: ChatProviderId, cfg: ProbeConfig, text: string, system: string): Promise<string> {
  const p = CHAT_PROVIDERS.find((x) => x.id === id)!
  const key = cfg.keys[id]
  if (!key) throw new Error(`Chiave ${p.label} non inserita (facoltativa)`)
  const r = await postJson<ChatResp>(`${p.baseUrl}/chat/completions`, { Authorization: `Bearer ${key}` }, {
    model: p.model,
    temperature: 0,
    messages: [{ role: 'system', content: system }, { role: 'user', content: text }],
  })
  return (r.choices?.[0]?.message?.content ?? '').trim()
}

export async function translate(id: TranslatorId, cfg: ProbeConfig, text: string, from: 'zh' | 'en'): Promise<string> {
  if (id === 'chrome') return translateOnDevice(text, from)
  return isChatProvider(id) ? chat(id, cfg, text, TR_SYSTEM(from)) : gemini(cfg, [{ text }], TR_SYSTEM(from))
}

/** Riconoscimento con lingua automatica su un blocco WAV. */
export async function transcribe(_id: AsrProviderId, cfg: ProbeConfig, wav: Blob): Promise<string> {
  const b64 = await toBase64(wav)
  return gemini(cfg, [{ text: ASR_PROMPT }, { inline_data: { mime_type: 'audio/wav', data: b64 } }])
}
