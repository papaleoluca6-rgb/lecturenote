import { useLiveQuery } from 'dexie-react-hooks'
import { memo, useMemo, useRef } from 'react'
import type { Id, Sec, Stroke } from '../../db/schema'
import { findPage, type InkTarget } from './data'
import { VB_W, strokePath } from './freehand'
import { useInkInput } from './useInkInput'
import './ink.css'

interface Props {
  lessonId: Id
  target: InkTarget
  /** Dimensioni della pagina sotto (slide o pagina bianca): servono solo per le proporzioni. */
  width: number
  height: number
  now: () => Sec
}

function StrokePath({ s, vbH }: { s: Stroke; vbH: number }) {
  return <path d={strokePath(s, vbH)} fill={s.color} opacity={s.tool === 'highlighter' ? 0.4 : 1} />
}

/** Tratti già salvati: memorizzati, così disegnare non ricalcola tutta la pagina a ogni movimento. */
const Saved = memo(function Saved({ strokes, vbH, hidden }: { strokes: Stroke[]; vbH: number; hidden: Set<number> }) {
  return <g>{strokes.map((s, i) => (hidden.has(i) ? null : <StrokePath key={i} s={s} vbH={vbH} />))}</g>
})

/** Livello trasparente di scrittura a mano, sovrapposto esattamente alla pagina (anche quando la slide è ingrandita). */
export function InkLayer({ lessonId, target, width, height, now }: Props) {
  const slideId = 'slideId' in target ? target.slideId : undefined
  const pageId = 'pageId' in target ? target.pageId : undefined
  const page = useLiveQuery(() => findPage(slideId ? { slideId } : { pageId: pageId ?? '' }), [slideId, pageId])
  const vbH = (VB_W * height) / width
  const live = useRef<SVGPathElement>(null)
  const cursor = useRef<SVGCircleElement>(null)
  const refs = useMemo(() => ({ live, cursor }), [])
  const ink = useInkInput(lessonId, target, page, vbH, now, refs)
  const strokes = useMemo(() => page?.strokes ?? [], [page])

  return (
    <svg className="ink-layer" viewBox={`0 0 ${VB_W} ${vbH}`} preserveAspectRatio="none" {...ink.handlers}>
      <Saved strokes={strokes} vbH={vbH} hidden={ink.hidden} />
      {ink.pending.map((s, i) => <StrokePath key={`p${i}`} s={s} vbH={vbH} />)}
      <path ref={live} className="ink-live" />
      <circle ref={cursor} className="ink-cursor" style={{ display: 'none' }} />
    </svg>
  )
}
