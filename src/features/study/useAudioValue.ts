import { useCallback, useSyncExternalStore } from 'react'
import type { LessonAudio } from '../../lib/lessonAudio'

/**
 * Un solo valore letto dal lettore (es. "c'è audio?", "riga attuale"): il componente si ridisegna solo quando
 * quel valore cambia, non a ogni avanzamento del tempo. `read` deve restituire un valore semplice (numero, booleano).
 */
export function useAudioValue<T>(player: LessonAudio, read: () => T): T {
  const subscribe = useCallback((fn: () => void) => player.subscribe(fn), [player])
  return useSyncExternalStore(subscribe, read)
}

/** Indice dell'ultimo momento con ts <= t in una lista ordinata per tempo (-1 se nessuno). */
export function lastAtOrBefore(list: readonly { ts: number }[], t: number): number {
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (list[mid].ts <= t) lo = mid + 1
    else hi = mid
  }
  return lo - 1
}
