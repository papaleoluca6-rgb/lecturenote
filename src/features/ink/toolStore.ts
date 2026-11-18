import { useSyncExternalStore } from 'react'
import type { Id } from '../../db/schema'
import { SIZES } from './freehand'

export type InkTool = 'pen' | 'highlighter' | 'eraser'

export interface ToolState {
  tool: InkTool
  /** Nome del token di colore in global.css (es. "--ink-blue"): il valore esatto viene salvato nel tratto. */
  color: string
  size: number
  /** Se vero anche il dito scrive; altrimenti il dito sfoglia e fa zoom, e scrive solo la penna (o il mouse). */
  fingerDraws: boolean
  /** Ultima pagina su cui si è scritto: «Annulla» agisce lì. */
  lastPageId?: Id
}

let state: ToolState = { tool: 'pen', color: '--ink-black', size: SIZES.medio, fingerDraws: false }
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
