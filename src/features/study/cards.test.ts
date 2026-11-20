import { describe, expect, it } from 'vitest'
import type { Flashcard } from '../../db/schema'
import { nextDue, nextDueAt } from './cards'

const MIN = 60_000
/** Mezzanotte locale del giorno di `ms` spostata di `days` giorni. */
const midnight = (ms: number, days: number) => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

describe('nextDue', () => {
  it('sbagliata: torna dopo 5 minuti', () => {
    const now = new Date(2026, 10, 16, 10, 0).getTime()
    expect(nextDue(0, false, now)).toBe(now + 5 * MIN)
  })

  it('"1 giorno" risposto alle 21 è da ripassare il giorno dopo già alle 18', () => {
    const mon21 = new Date(2026, 10, 16, 21, 0).getTime()
    const due = nextDue(1, true, mon21)
    expect(due).toBe(new Date(2026, 10, 17, 9, 0).getTime())
    expect(due <= new Date(2026, 10, 17, 18, 0).getTime()).toBe(true)
    expect(due > new Date(2026, 10, 16, 23, 59).getTime()).toBe(true)
  })

  it('le altre scatole contano i giorni dalla mezzanotte di oggi', () => {
    const now = new Date(2026, 10, 16, 8, 30).getTime()
    expect(nextDue(2, true, now)).toBe(midnight(now, 3))
    expect(nextDue(3, true, now)).toBe(midnight(now, 7))
    expect(nextDue(4, true, now)).toBe(midnight(now, 16))
  })

  it("attraverso il cambio dell'ora legale resta la mezzanotte locale", () => {
    const sat22 = new Date(2026, 9, 24, 22, 0).getTime() // in Europa l'ora legale finisce il 25 ottobre 2026
    expect(nextDue(2, true, sat22)).toBe(new Date(2026, 9, 27, 0, 0).getTime())
  })

  it('a cavallo di un fine mese', () => {
    const now = new Date(2026, 0, 31, 20, 0).getTime()
    expect(nextDue(1, true, now)).toBe(new Date(2026, 1, 1, 8, 0).getTime())
  })

  it('risposta a mezzanotte meno 5: non torna dopo 5 minuti ma almeno 12 ore dopo', () => {
    const late = new Date(2026, 10, 16, 23, 55).getTime()
    expect(nextDue(1, true, late)).toBe(late + 12 * 60 * MIN)
  })
})

describe('nextDueAt', () => {
  const card = (due: number) => ({ due }) as Flashcard
  it('la prima carta futura, null se sono tutte già da ripassare', () => {
    expect(nextDueAt([card(50), card(300), card(200)], 100)).toBe(200)
    expect(nextDueAt([card(50)], 100)).toBeNull()
  })
})
