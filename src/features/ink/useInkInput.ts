import { useCallback, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import type { Id, InkPage, Sec, Stroke } from '../../db/schema'
import { addStroke, removeStrokes, type InkTarget } from './data'
import { hitsStroke } from './freehand'
import { getTool, setTool, tokenColor } from './toolStore'

/** Dopo l'ultimo segnale della penna (anche in hover) il palmo resta ignorato per questo tempo. */
const PALM_MS = 800
const ERASER_R = 12
const r4 = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000

type Ev = RPointerEvent<SVGSVGElement>

/**
 * Input della penna con palm rejection. Gli eventi usati qui vengono marcati con preventDefault():
 * il viewer delle slide li ignora per zoom e scorrimento (convenzione DOM, nessun import tra feature).
 */
export function useInkInput(lessonId: Id, target: InkTarget, page: InkPage | undefined, vbH: number, now: () => Sec) {
  const [live, setLive] = useState<Stroke | null>(null)
  const [pending, setPending] = useState<Stroke[]>([])
  const [hidden, setHidden] = useState<Set<number>>(new Set())
  const drawing = useRef<number | null>(null)
  const lastPen = useRef(-Infinity)
  const stroke = useRef<Stroke | null>(null)
  /** Tratti toccati dalla gomma nel gesto in corso (ref: gli eventi arrivano prima del nuovo render). */
  const erased = useRef(new Set<number>())
  const lastErase = useRef<[number, number] | null>(null)

  const canDraw = (e: Ev) => e.pointerType === 'pen' || e.pointerType === 'mouse' || (e.pointerType === 'touch' && getTool().fingerDraws)
  const isPalm = (e: Ev) => e.pointerType === 'touch' && (drawing.current !== null || performance.now() - lastPen.current < PALM_MS)
  const pointsOf = (e: Ev): Stroke['points'] => {
    const r = e.currentTarget.getBoundingClientRect()
    const evs = e.nativeEvent.getCoalescedEvents?.() ?? []
    return (evs.length ? evs : [e.nativeEvent]).map((ev) => [
      r4((ev.clientX - r.left) / r.width),
      r4((ev.clientY - r.top) / r.height),
      ev.pointerType === 'pen' ? Math.round((ev.pressure || 0.5) * 100) / 100 : 0.5,
    ])
  }
  const erase = (pts: Stroke['points']) => {
    if (!page) return
    // Ogni punto forma un segmento con il precedente: anche un passaggio veloce cancella quello che attraversa.
    const segs = pts.map(([x, y]): [[number, number], [number, number]] => {
      const a = lastErase.current ?? [x, y]
      lastErase.current = [x, y]
      return [a, [x, y]]
    })
    const add = page.strokes.flatMap((s, i) => (!erased.current.has(i) && segs.some(([a, b]) => hitsStroke(s, a, b, vbH, ERASER_R)) ? [i] : []))
    if (!add.length) return
    add.forEach((i) => erased.current.add(i))
    setHidden(new Set(erased.current))
  }

  const onPointerDown = (e: Ev) => {
    if (e.pointerType === 'pen') lastPen.current = performance.now()
    if (drawing.current !== null || !canDraw(e) || e.button > 0) {
      if (isPalm(e)) e.preventDefault()
      return
    }
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // puntatore già rilasciato: si disegna senza cattura
    }
    drawing.current = e.pointerId
    const t = getTool()
    const pts = pointsOf(e)
    lastErase.current = null
    if (t.tool === 'eraser') return erase(pts)
    stroke.current = { points: pts, color: tokenColor(t.color), size: t.size, tool: t.tool, ts: Math.round(now() * 100) / 100 }
    setLive(stroke.current)
  }

  const onPointerMove = (e: Ev) => {
    if (e.pointerType === 'pen') lastPen.current = performance.now()
    if (e.pointerId !== drawing.current) {
      if (isPalm(e)) e.preventDefault()
      return
    }
    e.preventDefault()
    const pts = pointsOf(e)
    if (getTool().tool === 'eraser') return erase(pts)
    if (!stroke.current) return
    stroke.current = { ...stroke.current, points: [...stroke.current.points, ...pts] }
    setLive(stroke.current)
  }

  const onPointerUp = (e: Ev) => {
    if (e.pointerId !== drawing.current) {
      if (isPalm(e)) e.preventDefault()
      return
    }
    e.preventDefault()
    drawing.current = null
    if (e.pointerType === 'pen') lastPen.current = performance.now()
    const s = stroke.current
    stroke.current = null
    setLive(null)
    if (s) {
      setPending((p) => [...p, s])
      void addStroke(lessonId, target, s).then((pageId) => setTool({ lastPageId: pageId }))
    } else if (page && erased.current.size) {
      void removeStrokes(page.id, erased.current)
      erased.current = new Set()
    }
  }

  /** Chiamato quando la pagina salvata cambia: i tratti in attesa e quelli cancellati sono ormai nel database. */
  const settle = useCallback(() => {
    setPending([])
    if (!erased.current.size) setHidden(new Set())
  }, [])

  return { live, pending, hidden, settle, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } }
}
