import { describe, expect, it } from 'vitest'
import type { Stroke } from '../../db/schema'
import { snapHighlight, textLines } from './snap'

// Pagina quadrata: vbH = VB_W = 1000, così x e y normalizzati hanno la stessa scala.
const VBH = 1000
const H = 0.02
const W = 0.05
const STEP = 0.06

/** Parole [x, y, w, h, …] di una riga che parte da x0, alta H, con `n` parole larghe W. */
function row(y: number, x0: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => [x0 + i * STEP, y, W, H]).flat()
}

const hl = (points: [number, number][]): Stroke => ({
  points: points.map(([x, y]) => [x, y, 0.5]),
  color: '#ff0',
  size: 24,
  tool: 'highlighter',
  ts: 0,
})

/** Estremi x della fascia, tolto l'accorciamento di metà spessore fatto per perfect-freehand. */
const span = (b: Stroke) => [b.points[0][0] - b.size / 2 / 1000, b.points.at(-1)![0] + b.size / 2 / 1000]

describe('snapHighlight', () => {
  it('una riga: fascia dalla prima all’ultima parola toccata', () => {
    const lines = textLines(row(0.1, 0.05, 6))
    const out = snapHighlight(hl([[0.12, 0.11], [0.2, 0.11], [0.24, 0.112]]), lines, VBH)!
    expect(out).toHaveLength(1)
    const [x0, x1] = span(out[0])
    // Parole 2-4 (x 0.11 … 0.28), più un filo di margine.
    expect(x0).toBeCloseTo(0.11 - 0.0024, 3)
    expect(x1).toBeCloseTo(0.28 + 0.0024, 3)
    expect(out[0].points[0][1]).toBeCloseTo(0.11, 4)
    expect(out[0].size).toBe(20)
  })

  it('più righe: una fascia per riga, come una selezione di testo', () => {
    const lines = textLines([...row(0.1, 0.05, 6), ...row(0.14, 0.05, 6), ...row(0.18, 0.05, 6)])
    const out = snapHighlight(hl([[0.24, 0.11], [0.2, 0.15], [0.12, 0.19]]), lines, VBH)!
    expect(out).toHaveLength(3)
    const end = 0.05 + 5 * STEP + W
    expect(span(out[0])[0]).toBeCloseTo(0.23 - 0.0024, 3)
    expect(span(out[0])[1]).toBeCloseTo(end + 0.0024, 3)
    expect(span(out[1])[0]).toBeCloseTo(0.05 - 0.0024, 3)
    expect(span(out[1])[1]).toBeCloseTo(end + 0.0024, 3)
    expect(span(out[2])[1]).toBeCloseTo(0.16 + 0.0024, 3)
  })

  it('due colonne: le fasce non attraversano la colonna accanto', () => {
    // Colonna sinistra 0.05–0.40, destra da 0.55: lo spazio (0.15) è molto più di 3 altezze di parola.
    const flat = [0.1, 0.14, 0.18].flatMap((y) => [...row(y, 0.05, 6), ...row(y, 0.55, 6)])
    const lines = textLines(flat)
    const out = snapHighlight(hl([[0.24, 0.11], [0.2, 0.15], [0.12, 0.19]]), lines, VBH)!
    expect(out).toHaveLength(3)
    for (const b of out) expect(span(b)[1]).toBeLessThan(0.45)
  })

  it('due colonne: si può evidenziare anche nella colonna destra', () => {
    const flat = [0.1, 0.14].flatMap((y) => [...row(y, 0.05, 6), ...row(y, 0.55, 6)])
    const out = snapHighlight(hl([[0.62, 0.11], [0.7, 0.15]]), textLines(flat), VBH)!
    expect(out).toHaveLength(2)
    for (const b of out) expect(span(b)[0]).toBeGreaterThan(0.5)
  })

  it('senza testo: un tratto quasi orizzontale diventa dritto', () => {
    const out = snapHighlight(hl([[0.1, 0.5], [0.2, 0.502], [0.3, 0.499]]), [], VBH)!
    expect(out).toHaveLength(1)
    const ys = new Set(out[0].points.map((p) => p[1]))
    expect(ys.size).toBe(1)
    expect(out[0].points[0][1]).toBe(0.5)
  })

  it('un cerchio senza parole sotto resta com’è (null)', () => {
    const circle = Array.from({ length: 24 }, (_, i): [number, number] => [0.5 + 0.1 * Math.cos(i / 4), 0.5 + 0.1 * Math.sin(i / 4)])
    expect(snapHighlight(hl(circle), [], VBH)).toBeNull()
    // Anche con del testo altrove sulla pagina.
    expect(snapHighlight(hl(circle), textLines(row(0.1, 0.05, 6)), VBH)).toBeNull()
  })
})
