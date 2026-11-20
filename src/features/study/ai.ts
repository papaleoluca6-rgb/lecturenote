import { getSetting } from '../../db/settings'
import { AI_IDS, ask, maxInputChars, type AiId } from '../../lib/ai'

// Riassunto e flashcard con l'AI: solo se l'utente ha inserito una sua chiave. Senza, si scrivono a mano.

export interface AiChoice { id: AiId; key: string }

/** AI da usare: quella scelta per la traduzione se ha la chiave, altrimenti la prima con una chiave. */
export async function pickAi(): Promise<AiChoice | null> {
  const pref = await getSetting('translator.provider')
  const order = [pref, ...AI_IDS].filter((id): id is AiId => (AI_IDS as readonly string[]).includes(id))
  for (const id of order) {
    const key = await getSetting(`apiKey.${id}`)
    if (key) return { id, key }
  }
  return null
}

const SUMMARY =
  "Sei un tutor universitario. Dal testo di una lezione (frasi del docente con il minuto, e note dello studente) scrivi in italiano " +
  'un riassunto per studiare: prima 2-3 frasi sul tema, poi i punti chiave in elenco puntato, definizioni e formule importanti, ' +
  "e infine «Da ricordare per l'esame». Testo semplice con trattini, niente markdown complesso."

const CARDS =
  'Dal testo di una lezione universitaria crea da 8 a 15 flashcard in italiano per ripassare i concetti più importanti. ' +
  'Rispondi SOLO con un array JSON: [{"front": "domanda", "back": "risposta breve", "ts": minuto_in_secondi}]. ' +
  '"ts" è il momento della lezione (in secondi) da cui viene la domanda, preso dai tempi [m:ss] del testo.'

/** Quanto testo della lezione mandare all'AI scelta (dipende dal suo contesto, vedi lib/aiProviders.ts). */
export const aiMaxChars = (ai: AiChoice) => maxInputChars(ai.id)

export const summarize = (ai: AiChoice, text: string) => ask(ai.id, ai.key, SUMMARY, text, 90_000)

export interface CardDraft { front: string; back: string; ts?: number }

/** Flashcard generate; accetta anche risposte con testo attorno al JSON. */
export async function generateCards(ai: AiChoice, text: string): Promise<CardDraft[]> {
  const out = await ask(ai.id, ai.key, CARDS, text, 90_000)
  const json = out.slice(out.indexOf('['), out.lastIndexOf(']') + 1)
  let rows: unknown
  try { rows = JSON.parse(json) } catch { throw new Error("L'AI non ha risposto con flashcard leggibili: riprova.") }
  if (!Array.isArray(rows)) throw new Error("L'AI non ha risposto con flashcard leggibili: riprova.")
  return rows
    .map((r: { front?: unknown; back?: unknown; ts?: unknown }) => ({
      front: String(r.front ?? '').trim(),
      back: String(r.back ?? '').trim(),
      ts: typeof r.ts === 'number' && r.ts >= 0 ? r.ts : undefined,
    }))
    .filter((c) => c.front && c.back)
}
