import { useEffect, useMemo, useLayoutEffect, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type RefObject } from 'react'
import type { Id, InkPage, Sec, Stroke } from '../../db/schema'
import { addStroke, removeStrokes, strokeKey, type InkTarget } from './data'
import { ERASER_R, hitsStroke, strokePath } from './freehand'
import { hideCursor, showCursor } from './inkCursor'
import { snapHighlight, type textLines } from './snap'
import { getTool, inkSaved, pushOp, setTool, tokenColor } from './toolStore'

/** Dopo l'ultimo segnale della penna (anche in hover) il palmo resta ignorato per questo tempo. */
const PALM_MS = 800
const r4 = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000

type Ev = RPointerEvent<SVGSVGElement>
type Pt = Stroke['points'][number]


/** Elementi SVG aggiornati direttamente (senza render di React): tratto in corso e cursore della penna. */
export interface InkRefs {
  live: RefObject<SVGPathElement | null>
  cursor: RefObject<SVGCircleElement | null>
}

/** Tasto laterale della S Pen (o tasto gomma): per questo gesto la penna cancella. Codici non verificati su ogni tablet. */
const sideButton = (e: Ev) => e.pointerType === 'pen' && ((e.buttons & (2 | 32)) !== 0 || e.button === 2 || e.button === 5)

/**
 * Input della penna con palm rejection. Gli eventi usati qui vengono marcati con preventDefault():
 * il viewer delle slide li ignora per zoom e scorrimento (convenzione DOM, nessun import tra feature).
 * Il tratto in corso non passa dallo stato di React: si aggiorna il `d` del path una volta per frame.
 */
export function useInkInput(lessonId: Id, target: InkTarget, page: InkPage | undefined, vbH: number, now: () => Sec, refs: InkRefs, lines: ReturnType<typeof textLines> = []) {
  const [pending, setPending] = useState<Stroke[]>([])
  /** Tratti toccati dalla gomma (per contenuto, non per posizione), nascosti finché il database non li toglie. */
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  // Tratti ormai nel database: non vanno più disegnati come «pending». Scrivendo veloce, il tratto successivo
  // può essere ancora in salvataggio: resta visibile finché non arriva anche lui.
  const saved = useMemo(() => new Set((page?.strokes ?? []).map(strokeKey)), [page])
  const shownPending = useMemo(() => pending.filter((s) => !saved.has(strokeKey(s))), [pending, saved])
  // Appena un tratto arriva nel database esce dai «pending»: se poi «Annulla» o la gomma lo tolgono,
  // non deve ricomparire da qui (prima restava lì fino al tratto successivo).
  const [prunedFor, setPrunedFor] = useState(page)
  if (page !== prunedFor) {
    setPrunedFor(page)
    if (pending.some((s) => saved.has(strokeKey(s)))) setPending(pending.filter((s) => !saved.has(strokeKey(s))))
    // Tratti ormai tolti dal database: non serve più nasconderli (e se «Annulla» li rimette, devono vedersi).
    if ([...hidden].some((k) => !saved.has(k))) setHidden(new Set([...hidden].filter((k) => saved.has(k))))
  }
  const drawing = useRef<number | null>(null)
  const erasing = useRef(false)
  const lastPen = useRef(-Infinity)
  const stroke = useRef<Stroke | null>(null)
  /** Punti previsti dal browser: solo disegnati, mai salvati. */
  const predicted = useRef<Pt[]>([])
  const frame = useRef(0)
  /** Tratti toccati dalla gomma nel gesto in corso (ref: gli eventi arrivano prima del nuovo render). */
  const erased = useRef(new Set<string>())
  const lastErase = useRef<[number, number] | null>(null)

  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  // Il tratto appena finito è ora tra i «pending»: si svuota il path dal vivo prima del paint, niente sfarfallio.
  useLayoutEffect(() => {
    if (drawing.current === null && !stroke.current) refs.live.current?.setAttribute('d', '')
  }, [pending, refs])

  const isPalm = (e: Ev) => e.pointerType === 'touch' && (drawing.current !== null || performance.now() - lastPen.current < PALM_MS)
  const canDraw = (e: Ev) =>
    e.pointerType === 'pen' || (e.pointerType === 'mouse' && e.button === 0) || (e.pointerType === 'touch' && getTool().fingerDraws && !isPalm(e))
  const penSignal = (e: Ev) => {
    if (e.pointerType !== 'pen') return
    lastPen.current = performance.now()
    if (!getTool().penSeen) setTool({ penSeen: true, fingerDraws: false })
  }
  const toPoint = (ev: PointerEvent, r: DOMRect): Pt => [
    r4((ev.clientX - r.left) / r.width),
    r4((ev.clientY - r.top) / r.height),
    ev.pointerType === 'pen' ? Math.round((ev.pressure || 0.5) * 100) / 100 : 0.5,
  ]
  const pointsOf = (e: Ev): Pt[] => {
    const r = e.currentTarget.getBoundingClientRect()
    const evs = e.nativeEvent.getCoalescedEvents?.() ?? []
    predicted.current = (e.nativeEvent.getPredictedEvents?.() ?? []).map((ev) => toPoint(ev, r))
    return (evs.length ? evs : [e.nativeEvent]).map((ev) => toPoint(ev, r))
  }

  const paint = (done: boolean) => {
    const s = stroke.current
    const el = refs.live.current
    if (!s || !el) return
    const pts = !done && predicted.current.length ? [...s.points, ...predicted.current] : s.points
    el.setAttribute('d', strokePath({ ...s, points: pts }, vbH, done))
  }
  const schedule = () => {
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        paint(false)
      })
  }

  const erase = (pts: Pt[]) => {
    if (!page) return
    // Ogni punto forma un segmento con il precedente: anche un passaggio veloce cancella quello che attraversa.
    const segs = pts.map(([x, y]): [[number, number], [number, number]] => {
      const a = lastErase.current ?? [x, y]
      lastErase.current = [x, y]
      return [a, [x, y]]
    })
    const add = page.strokes.flatMap((s) => {
      const k = strokeKey(s)
      return !erased.current.has(k) && segs.some(([a, b]) => hitsStroke(s, a, b, vbH, ERASER_R)) ? [k] : []
    })
    if (!add.length) return
    add.forEach((k) => erased.current.add(k))
    setHidden((h) => new Set([...h, ...add]))
  }

  const onPointerDown = (e: Ev) => {
    penSignal(e)
    if (drawing.current !== null || !canDraw(e)) {
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
    erasing.current = t.tool === 'eraser' || sideButton(e)
    if (erasing.current) {
      const [x, y] = pts[pts.length - 1]
      if (e.pointerType === 'pen') showCursor(refs.cursor.current, x, y, vbH, true)
      return erase(pts)
    }
    hideCursor(refs.cursor.current)
    const hl = t.tool === 'highlighter'
    const s: Stroke = { points: pts, color: tokenColor(t.color), size: t.size, tool: hl ? 'highlighter' : 'pen', ts: Math.round(now() * 100) / 100 }
    stroke.current = s
    const el = refs.live.current
    el?.setAttribute('fill', s.color)
    el?.setAttribute('opacity', hl ? '0.4' : '1')
    schedule()
  }

  const onPointerMove = (e: Ev) => {
    penSignal(e)
    if (e.pointerId !== drawing.current) {
      if (isPalm(e)) e.preventDefault()
      // Penna sospesa sopra il foglio: il cursore mostra dove scriverà.
      if (e.pointerType === 'pen' && drawing.current === null) {
        const r = e.currentTarget.getBoundingClientRect()
        const [x, y] = toPoint(e.nativeEvent, r)
        showCursor(refs.cursor.current, x, y, vbH, sideButton(e))
      }
      return
    }
    e.preventDefault()
    const pts = pointsOf(e)
    if (erasing.current) {
      const [x, y] = pts[pts.length - 1]
      if (e.pointerType === 'pen') showCursor(refs.cursor.current, x, y, vbH, true)
      return erase(pts)
    }
    if (!stroke.current) return
    stroke.current.points.push(...pts)
    schedule()
  }

  const onPointerUp = (e: Ev) => {
    penSignal(e)
    if (e.pointerId !== drawing.current) {
      if (isPalm(e)) e.preventDefault()
      return
    }
    e.preventDefault()
    drawing.current = null
    cancelAnimationFrame(frame.current)
    frame.current = 0
    predicted.current = []
    paint(true)
    const s = stroke.current
    stroke.current = null
    if (s) {
      // Evidenziatore: la traccia a mano diventa una fascia esatta sulle parole (o almeno dritta).
      const add = (s.tool === 'highlighter' && snapHighlight(s, lines, vbH)) || [s]
      setPending((p) => [...p, ...add])
      addStroke(lessonId, target, add)
        .then((pageId) => {
          pushOp({ pageId, kind: 'add', strokes: add })
          inkSaved()
        })
        .catch((err: unknown) => {
          // Non salvato: il tratto sparisce subito invece di sembrare salvato e mancare alla riapertura.
          setPending((p) => p.filter((x) => !add.includes(x)))
          inkSaved(err)
        })
    } else if (page && erased.current.size) {
      const pageId = page.id
      const keys = erased.current
      removeStrokes(pageId, keys)
        .then((removed) => {
          if (removed.length) pushOp({ pageId, kind: 'erase', strokes: removed })
          inkSaved()
        })
        .catch((err: unknown) => {
          setHidden((h) => new Set([...h].filter((k) => !keys.has(k))))
          inkSaved(err)
        })
      erased.current = new Set()
    }
  }

  const onPointerLeave = () => hideCursor(refs.cursor.current)
  const onContextMenu = (e: RMouseEvent) => e.preventDefault()


  return { pending: shownPending, hidden, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onPointerLeave, onContextMenu } }
}
