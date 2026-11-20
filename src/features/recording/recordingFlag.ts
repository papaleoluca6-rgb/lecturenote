import type { Id } from '../../db/schema'

// Segno «sto registrando» in localStorage: se Android chiude la scheda a metà lezione,
// al riavvio l'app lo trova ancora lì e avvisa che la registrazione si è interrotta.

const KEY = 'ln:recording'

/** Lezione che stava registrando quando l'app è stata chiusa (null se nessuna). */
export function recordingFlag(): Id | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setRecordingFlag(lessonId: Id | null): void {
  try {
    if (lessonId === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, lessonId)
  } catch {
    // memoria del browser non disponibile: niente avviso al riavvio, la registrazione funziona lo stesso
  }
}

/** Toglie il segno solo se è ancora di questa lezione (nel frattempo può esserne partita un'altra). */
export function clearRecordingFlag(lessonId: Id): void {
  if (recordingFlag() === lessonId) setRecordingFlag(null)
}
