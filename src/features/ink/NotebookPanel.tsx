import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import type { Id, InkPage, Sec } from '../../db/schema'
import { BLANK_H, BLANK_W, addBlankPage, blankPages, deletePage } from './data'
import { InkLayer } from './InkLayer'
import './ink.css'

/** Dimensione della pagina adattata al riquadro (contain). */
function useFit(ref: React.RefObject<HTMLDivElement | null>) {
  const [fit, setFit] = useState<{ w: number; h: number }>()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const k = Math.max(0, Math.min((el.clientWidth - 16) / BLANK_W, (el.clientHeight - 16) / BLANK_H))
      setFit({ w: Math.floor(BLANK_W * k), h: Math.floor(BLANK_H * k) })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return fit
}

function Paper({ lessonId, page, now }: { lessonId: Id; page: InkPage; now: () => Sec }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const fit = useFit(stageRef)
  return (
    <div ref={stageRef} className="ink-stage">
      {fit && (
        <div className="ink-paper" style={{ width: fit.w, height: fit.h }}>
          <InkLayer key={page.id} lessonId={lessonId} target={{ pageId: page.id }} width={BLANK_W} height={BLANK_H} now={now} />
        </div>
      )}
    </div>
  )
}

/** Pagine bianche per scrivere a mano, una dopo l'altra. */
export function NotebookPanel({ lessonId, now }: { lessonId: Id; now: () => Sec }) {
  const pages = useLiveQuery(() => blankPages(lessonId), [lessonId])
  const [currentId, setCurrentId] = useState<Id>()
  const list = pages ?? []
  const found = list.findIndex((p) => p.id === currentId)
  const index = found >= 0 ? found : list.length - 1
  const page = list[index]

  const add = async () => setCurrentId(await addBlankPage(lessonId))
  const remove = async () => {
    if (!page || (page.strokes.length && !confirm('Eliminare questa pagina e quello che c’è scritto?'))) return
    await deletePage(page.id)
    setCurrentId(list[index - 1]?.id ?? list[index + 1]?.id)
  }

  if (pages && !page)
    return (
      <div className="ink-empty">
        <p>Pagine bianche per scrivere con la penna, legate al momento della lezione.</p>
        <button className="ink-btn on" onClick={() => void add()}>+ Nuova pagina</button>
      </div>
    )

  return (
    <section className="ink-nb" aria-label="Pagine bianche">
      {page && <Paper lessonId={lessonId} page={page} now={now} />}
      <div className="ink-nav">
        <button className="ink-btn" disabled={index <= 0} onClick={() => setCurrentId(list[index - 1].id)} aria-label="Pagina precedente">‹</button>
        <span className="ink-count mono">{list.length ? `${index + 1} / ${list.length}` : ''}</span>
        <button className="ink-btn" disabled={index >= list.length - 1} onClick={() => setCurrentId(list[index + 1].id)} aria-label="Pagina successiva">›</button>
        <button className="ink-btn" onClick={() => void add()}>+ Pagina</button>
        <button className="ink-btn" disabled={!page} onClick={() => void remove()}>Elimina pagina</button>
      </div>
    </section>
  )
}
