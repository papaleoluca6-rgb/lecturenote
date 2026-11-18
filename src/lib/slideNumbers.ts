import type { Id, Slide } from '../db/schema'

/**
 * Numero di ogni slide dentro la sua presentazione (1, 2, …) e quante pagine ha la presentazione.
 * `Slide.page` NON è questo: è l'ordine (da 0) di tutte le slide della lezione, presentazioni comprese.
 */
export function slideNumbers(slides: Slide[]): Map<Id, { n: number; of: number }> {
  const byDeck = new Map<string, Slide[]>()
  for (const s of [...slides].sort((a, b) => a.page - b.page)) byDeck.set(s.deckName, [...(byDeck.get(s.deckName) ?? []), s])
  const out = new Map<Id, { n: number; of: number }>()
  for (const deck of byDeck.values()) deck.forEach((s, i) => out.set(s.id, { n: i + 1, of: deck.length }))
  return out
}
