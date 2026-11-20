import { describe, expect, it } from 'vitest'
import { wordBoxes, type Measure } from './textBoxes'

// Pagina 1000×1000 punti renderizzata a 1000×1000 pixel: pdf.js gira l'asse y (y in alto → y in basso).
const VT = [1, 0, 0, -1, 0, 1000]
const item = (str: string, width: number, x = 100, y = 500) => ({ str, width, transform: [10, 0, 0, 10, x, y] })
/** Arrotonda come wordBoxes, per confronti esatti. */
const boxes = (b: number[]) => Array.from({ length: b.length / 4 }, (_, i) => b.slice(i * 4, i * 4 + 4))

describe('wordBoxes', () => {
  it('divide il testo in parole agli spazi', () => {
    const out = boxes(wordBoxes([item('ab cd', 50)], VT, 1000, 1000))
    // Corpo 10: dal tratto alto (0.85) a sotto la linea di base (alto 1.1).
    expect(out).toEqual([
      [0.1, 0.4915, 0.02, 0.011],
      [0.13, 0.4915, 0.02, 0.011],
    ])
  })

  it('ogni carattere cinese è una parola, le parole latine restano intere', () => {
    const out = boxes(wordBoxes([item('中文 ok', 40)], VT, 1000, 1000))
    expect(out.map((b) => [b[0], b[2]])).toEqual([
      [0.1, 0.008],
      [0.108, 0.008],
      [0.124, 0.016],
    ])
  })

  it('con `measure` le lettere hanno la loro larghezza vera (i stretta, m larga)', () => {
    const measure: Measure = (t) => [...t].reduce((n, ch) => n + (ch === 'm' ? 3 : 1), 0)
    const out = boxes(wordBoxes([item('i mm', 40)], VT, 1000, 1000, measure))
    // Larghezze 1 + 1 + 3 + 3 = 8 su 40 punti: «i» 0–5, «mm» 10–40.
    expect(out.map((b) => [b[0], b[2]])).toEqual([
      [0.1, 0.005],
      [0.11, 0.03],
    ])
  })

  it('ignora testo vuoto e ruotato', () => {
    const rotated = { str: 'su', width: 20, transform: [0, 10, -10, 0, 100, 500] }
    expect(wordBoxes([item('   ', 10), rotated], VT, 1000, 1000)).toEqual([])
  })
})
