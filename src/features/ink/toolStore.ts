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
  /** Ultima pagina su cui si è scritto: «Annulla» agisce lì. */
  lastPageId?: Id
  /** Tratti tolti con «Annulla», da rimettere con «Ripeti» (si svuota a ogni tratto nuovo). */
  redo: { pageId: Id; stroke: Stroke }[]
  /** true mentre la S Pen è sospesa sopra lo schermo o scrive: la barra lo mostra. */
  penSeen: boolean
}

let state: ToolState = { tool: 'pen', color: '--ink-black', size: SIZES.medio, textSize: TEXT_SIZES.medio, penColor: '--ink-black', hlColor: '--ink-hl-yellow', fingerDraws: false, redo: [], penSeen: false }
const subs = new Set<() => void>()

export function setTool(patch: Partial<ToolState>): void {
  state = { ...state, ...patch }
  subs.forEach((f) => f())
}

export const getTool = (): ToolState => state

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
