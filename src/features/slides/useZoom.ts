import { useRef, useState, type PointerEvent as RPointerEvent } from 'react'

const MAX_ZOOM = 4
const SWIPE_PX = 60
const DOUBLE_TAP_MS = 300

interface View {
  s: number
  x: number
  y: number
}
const RESET: View = { s: 1, x: 0, y: 0 }
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Gesti touch del viewer: pizzico per lo zoom, trascinamento quando ingrandita,
 * scorrimento orizzontale per cambiare slide, doppio tocco per zoom 2.5× / reset.
 */
export function useZoom(onSwipe: (dir: 1 | -1) => void) {
  const [view, setView] = useState<View>(RESET)
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const start = useRef({ view: RESET, d: 0, mid: { x: 0, y: 0 }, at: { x: 0, y: 0 } })
  const lastTap = useRef(0)
  /** Il gesto in corso ha usato due dita: alla fine non vale come tocco né come scorrimento. */
  const multi = useRef(false)

  const clamp = (v: View, el: HTMLElement): View => {
    const s = Math.min(MAX_ZOOM, Math.max(1, v.s))
    const mx = ((s - 1) * el.clientWidth) / 2
    const my = ((s - 1) * el.clientHeight) / 2
    return { s, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) }
  }
  const mid = () => {
    const [a, b] = [...pts.current.values()]
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }
  const begin = (cur: View) => {
    const p = [...pts.current.values()]
    start.current = p.length >= 2 ? { view: cur, d: dist(p[0], p[1]), mid: mid(), at: p[0] } : { ...start.current, view: cur, at: p[0] }
  }

  /**
   * Eventi già usati dalla penna (preventDefault) o della penna stessa: non devono zoomare né sfogliare.
   * Se la penna si avvicina mentre un dito/palmo è appoggiato, il gesto del dito viene annullato.
   */
  const skip = (e: RPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'pen') {
      pts.current.clear()
      multi.current = true
    }
    if (!e.defaultPrevented && e.pointerType !== 'pen') return false
    pts.current.delete(e.pointerId)
    return true
  }

  const onPointerDown = (e: RPointerEvent<HTMLElement>) => {
    if (skip(e)) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // puntatore già rilasciato: si continua senza cattura
    }
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.current.size >= 2) multi.current = true
    begin(view)
  }
  const onPointerMove = (e: RPointerEvent<HTMLElement>) => {
    if (skip(e) || !pts.current.has(e.pointerId)) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const st = start.current
    const el = e.currentTarget
    if (pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()]
      const m = mid()
      setView(clamp({ s: st.view.s * (dist(a, b) / st.d), x: st.view.x + m.x - st.mid.x, y: st.view.y + m.y - st.mid.y }, el))
    } else if (st.view.s > 1) {
      setView(clamp({ ...st.view, x: st.view.x + e.clientX - st.at.x, y: st.view.y + e.clientY - st.at.y }, el))
    }
  }
  const onPointerUp = (e: RPointerEvent<HTMLElement>) => {
    if (!pts.current.has(e.pointerId)) {
      if (pts.current.size === 0) multi.current = false
      return
    }
    const was = pts.current.size
    pts.current.delete(e.pointerId)
    if (pts.current.size > 0) return begin(view)
    const wasMulti = multi.current
    multi.current = false
    if (was !== 1 || wasMulti) return
    const dx = e.clientX - start.current.at.x
    const dy = e.clientY - start.current.at.y
    if (view.s <= 1 && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) return onSwipe(dx < 0 ? 1 : -1)
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const now = performance.now()
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0
        return setView(view.s > 1 ? RESET : { s: 2.5, x: 0, y: 0 })
      }
      lastTap.current = now
    }
  }
  const onPointerCancel = (e: RPointerEvent<HTMLElement>) => {
    pts.current.delete(e.pointerId)
    if (pts.current.size > 0) begin(view)
  }

  return {
    zoomed: view.s > 1.01,
    style: { transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` },
    reset: () => setView(RESET),
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  }
}
