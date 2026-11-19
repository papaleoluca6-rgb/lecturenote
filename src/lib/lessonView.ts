import { useState } from 'react'
import type { Id } from '../db/schema'

// Dove si era rimasti: lezione aperta, scheda, slide e pagina. Solo comodità di questo tablet (localStorage):
// se il browser la cancella si riparte dall'inizio, nessun dato della lezione si perde.

const OPEN = 'ln:open'
const viewKey = (lessonId: Id) => `ln:view:${lessonId}`

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // memoria del browser non disponibile: pazienza
  }
}

function readView(lessonId: Id): Record<string, string> {
  try {
    return JSON.parse(read(viewKey(lessonId)) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

/** Lezione aperta l'ultima volta (per riaprirla se Android ricarica l'app). */
export const lastOpenLesson = (): Id | null => read(OPEN)
export const rememberOpenLesson = (lessonId: Id | null) => write(OPEN, lessonId)

/** Come useState, ma il valore resta salvato per la lezione: uscendo e rientrando si ritrova. */
export function useLessonView<T extends string>(lessonId: Id, key: string): [T | undefined, (v: T | undefined) => void] {
  const [value, setValue] = useState(() => readView(lessonId)[key] as T | undefined)
  const set = (v: T | undefined) => {
    setValue(v)
    const view = readView(lessonId)
    if (v === undefined) delete view[key]
    else view[key] = v
    write(viewKey(lessonId), JSON.stringify(view))
  }
  return [value, set]
}
