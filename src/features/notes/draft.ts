import type { Id, Sec } from '../../db/schema'

// Bozza della nota in scrittura, messa da parte quando l'app va in background: se Android chiude Chrome
// (succede spesso con 3 GB di RAM, es. aprendo la fotocamera), riaprendo la lezione il testo torna nel riquadro.
// localStorage può mancare (finestra privata, dati bloccati): ogni accesso è protetto.

interface Draft {
  text: string
  startTs?: Sec
}

const key = (lessonId: Id) => `ln:notedraft:${lessonId}`

export function loadDraft(lessonId: Id): Draft | undefined {
  try {
    const raw = localStorage.getItem(key(lessonId))
    const d = raw ? (JSON.parse(raw) as Partial<Draft>) : undefined
    return typeof d?.text === 'string' && d.text.trim() ? { text: d.text, startTs: typeof d.startTs === 'number' ? d.startTs : undefined } : undefined
  } catch {
    return undefined
  }
}

/** Mette da parte la bozza (o la toglie se è vuota / `undefined`). */
export function keepDraft(lessonId: Id, d: Draft | undefined): void {
  try {
    if (d?.text.trim()) localStorage.setItem(key(lessonId), JSON.stringify({ text: d.text, startTs: d.startTs }))
    else localStorage.removeItem(key(lessonId))
  } catch {
    // niente localStorage: la bozza resta solo in memoria
  }
}
