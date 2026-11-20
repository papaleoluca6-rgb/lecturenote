import { describe, expect, it } from 'vitest'
import type { Stroke } from '../../db/schema'
import { strokeKey } from './strokeKey'

const band = (color: string, x1 = 0.3): Stroke => ({
  points: [[0.1, 0.2, 0.5], [0.2, 0.2, 0.5], [x1, 0.2, 0.5]],
  color,
  size: 20,
  tool: 'highlighter',
  ts: 0,
})

describe('strokeKey', () => {
  it('resta uguale per la copia salvata nel database', () => {
    const s = band('#ff0')
    expect(strokeKey(structuredClone(s))).toBe(strokeKey(s))
  })

  it('tratti vecchi senza id: colore e ultimo punto li distinguono anche con lo stesso tempo', () => {
    expect(strokeKey(band('#ff0'))).not.toBe(strokeKey(band('#0f0')))
    expect(strokeKey(band('#ff0'))).not.toBe(strokeKey(band('#ff0', 0.35)))
  })

  it('tratti nuovi: due fasce identiche sulla stessa parola hanno chiavi diverse grazie all’id', () => {
    const a = { ...band('#ff0'), id: 'a' }
    const b = { ...band('#ff0'), id: 'b' }
    expect(strokeKey(a)).not.toBe(strokeKey(b))
    expect(strokeKey(structuredClone(a))).toBe(strokeKey(a))
  })
})
