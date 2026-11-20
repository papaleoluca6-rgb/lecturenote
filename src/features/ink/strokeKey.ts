import type { Stroke } from '../../db/schema'

/**
 * Identità di un tratto anche dopo il passaggio dal database (che ne salva una copia).
 * Tratti vecchi senza id: tempo, colore, numero di punti, primo e ultimo punto
 * (due fasce dell'evidenziatore sulla stessa parola, fuori registrazione, hanno lo stesso tempo).
 */
export const strokeKey = (s: Stroke): string =>
  s.id ?? `${s.ts}|${s.color}|${s.points.length}|${s.points[0]?.join(',')}|${s.points.at(-1)?.join(',')}`
