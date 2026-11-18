import { CHAT_PROVIDERS, type ChatProviderId } from './aiProviders'
import { postJson } from './http'

// Chiamate alle AI facoltative (solo con la chiave dell'utente, salvata in db.settings). Nessuna è necessaria.

export type AiId = 'gemini' | ChatProviderId
export const AI_IDS: readonly AiId[] = ['gemini', ...CHAT_PROVIDERS.map((p) => p.id)]
export const GEMINI_MODEL = 'gemini-2.5-flash-lite'
export const aiLabel = (id: AiId) => (id === 'gemini' ? 'Gemini' : CHAT_PROVIDERS.find((p) => p.id === id)!.label)

export interface GeminiPart { text?: string; inline_data?: { mime_type: string; data: string } }
interface GeminiResp { candidates?: { content?: { parts?: { text?: string }[] } }[] }

export async function gemini(key: string, parts: GeminiPart[], system?: string, model = GEMINI_MODEL, timeoutMs?: number): Promise<string> {
  if (!key) throw new Error('Chiave Gemini non inserita (facoltativa)')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  const r = await postJson<GeminiResp>(url, { 'x-goog-api-key': key }, {
    ...(system && { systemInstruction: { parts: [{ text: system }] } }),
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0 },
  }, timeoutMs)
  return (r.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
}

interface ChatResp { choices?: { message?: { content?: string } }[] }

/** AI con API compatibile OpenAI (Qwen, DeepSeek, Kimi). */
export async function chat(id: ChatProviderId, key: string, text: string, system: string, timeoutMs?: number): Promise<string> {
  const p = CHAT_PROVIDERS.find((x) => x.id === id)!
  if (!key) throw new Error(`Chiave ${p.label} non inserita (facoltativa)`)
  const r = await postJson<ChatResp>(`${p.baseUrl}/chat/completions`, { Authorization: `Bearer ${key}` }, {
    model: p.model,
    temperature: 0,
    messages: [{ role: 'system', content: system }, { role: 'user', content: text }],
  }, timeoutMs)
  return (r.choices?.[0]?.message?.content ?? '').trim()
}

/** Domanda di solo testo a una qualsiasi delle AI. */
export function ask(id: AiId, key: string, system: string, text: string, timeoutMs?: number): Promise<string> {
  return id === 'gemini' ? gemini(key, [{ text }], system, GEMINI_MODEL, timeoutMs) : chat(id, key, text, system, timeoutMs)
}
