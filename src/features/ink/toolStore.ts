import { useSyncExternalStore } from 'react'
import type { Id, Stroke } from '../../db/schema'
import { SIZES } from './freehand'

/** Grandezze del testo delle caselle, in proporzione alla larghezza della pagina. */
export const TEXT_SIZES = { piccolo: 0.018, medio: 0.026, grande: 0.04 } as const

export type InkTool = 'pen' | 'highlighter' | 'eraser' | 'text'

export interface ToolState {
  tool: InkTool
  /** Nome del token di colore in global.css (es. "--ink-blue"): il valore esatto viene salvato nel tratto. */
  color: string
  size: number
  /** Grandezza del testo delle nuove caselle (proporzione della larghezza della pagina). */
  textSize: number
  /** Ultimo colore usato con la penna e con l'evidenziatore, per tornarci cambiando strumento. */
  penColor: string
  hlColor: string
  /** Se vero anche il dito scrive; altrimenti il dito sfoglia e fa zoom, e scrive solo la penna (o il mouse). */
  fingerDraws: boolean
  /** Azioni da annullare, l'ultima in fondo: tratti scritti o cancellati con la gomma. */
  undo: InkOp[]
  /** Azioni annullate, da rifare con «Ripeti» (si svuota a ogni azione nuova). */
  redo: InkOp[]
  /** true mentre la S Pen è sospesa sopra lo schermo o scrive: la barra lo mostra. */
  penSeen: boolean
  /** Ultimo salvataggio di penna o testo fallito (es. spazio esaurito): la barra lo mostra finché uno riesce. */
  saveError: string
}

let state: ToolState = { tool: 'pen', color: '--ink-black', size: SIZES.medio, textSize: TEXT_SIZES.medio, penColor: '--ink-black', hlColor: '--ink-hl-yellow', fingerDraws: false, undo: [], redo: [], penSeen: false, saveError: '' }
const subs = new Set<() => void>()

export function setTool(patch: Partial<ToolState>): void {
  state = { ...state, ...patch }
  subs.forEach((f) => f())
}

export const getTool = (): ToolState => state

/** Un'azione della penna: tratti aggiunti (penna, evidenziatore: anche più fasce insieme) o tolti dalla gomma. */
export interface InkOp {
  pageId: Id
  kind: 'add' | 'erase'
  strokes: Stroke[]
}

/** Esito di un salvataggio di penna o testo: senza errore toglie l'avviso, con errore lo mostra. */
export function inkSaved(err?: unknown): void {
  if (!err) {
    if (state.saveError) setTool({ saveError: '' })
    return
  }
  console.error('Salvataggio della penna non riuscito', err)
  const full = err instanceof Error && /quota/i.test(`${err.name} ${err.message}`)
  setTool({ saveError: full ? 'Spazio esaurito: l’ultima modifica non è stata salvata.' : 'Salvataggio non riuscito: riprova.' })
}

/** Registra un'azione per «Annulla» (al massimo le ultime 100). */
export function pushOp(op: InkOp): void {
  setTool({ undo: [...state.undo.slice(-99), op], redo: [] })
}

export function useInkTool(): ToolState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => void subs.delete(f)
    },
    getTool,
  )
}

/** Valore del token di colore (i colori vivono solo in global.css). */
export function tokenColor(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#000'
}
