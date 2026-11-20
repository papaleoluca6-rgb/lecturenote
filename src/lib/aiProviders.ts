// AI cinesi facoltative per la traduzione: tutte con API compatibile OpenAI (POST <baseUrl>/chat/completions).
// Servono solo se l'utente inserisce la propria chiave; funzionano in Cina senza VPN. Il parlato→testo resta a Gemini/Chrome.

export interface ChatProvider {
  id: 'qwen' | 'deepseek' | 'kimi'
  label: string
  baseUrl: string
  model: string
  /** Caratteri massimi di testo da mandare in una richiesta (contesto del modello in token, con margine per il cinese e per la risposta). */
  maxChars: number
  /** Dove si crea la chiave (mostrato nelle impostazioni). */
  keyHelp: string
}

export const CHAT_PROVIDERS: readonly ChatProvider[] = [
  { id: 'qwen', label: 'Qwen (Alibaba)', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', maxChars: 100_000, keyHelp: 'bailian.console.aliyun.com' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', maxChars: 60_000, keyHelp: 'platform.deepseek.com' },
  { id: 'kimi', label: 'Kimi (Moonshot)', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-128k', maxChars: 60_000, keyHelp: 'platform.moonshot.cn' },
]

export type ChatProviderId = ChatProvider['id']
export const isChatProvider = (id: string): id is ChatProviderId => CHAT_PROVIDERS.some((p) => p.id === id)
