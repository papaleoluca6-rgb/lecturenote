import { useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { newId, type Id, type InkPage, type Sec } from '../../db/schema'
import { putText, removeText, type InkTarget } from './data'
import { TextItem } from './TextItem'
import { inkSaved, tokenColor, useInkTool } from './toolStore'

/** Un tocco (non un trascinamento né un pizzico) crea una casella. */
const TAP_PX = 10
const TAP_MS = 600
/** Larghezza iniziale di una casella nuova, in proporzione alla pagina. */
const NEW_W = 0.35

interface Props {
  lessonId: Id
  target: InkTarget
  page: InkPage | undefined
  now: () => Sec
}

/**
 * Caselle di testo sopra la pagina. Con lo strumento «Testo» un tocco su un punto vuoto crea una casella lì;
 * con gli altri strumenti le caselle si vedono ma la penna ci scrive sopra.
 * Il tocco si riconosce al rilascio sulla finestra: il viewer delle slide cattura il dito per zoom e scorrimento.
 */
export function TextLayer({ lessonId, target, page, now }: Props) {
  const t = useInkTool()
  const active = t.tool === 'text'
  const ref = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<Id>()
  const [focusId, setFocusId] = useState<Id>()
  const boxes = page?.texts ?? []

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!active || e.target !== e.currentTarget || !e.isPrimary) return
    const at = { x: e.clientX, y: e.clientY, t: e.timeStamp }
    const rect = e.currentTarget.getBoundingClientRect()
    const done = (ev: PointerEvent) => {
      removeEventListener('pointerup', done)
      removeEventListener('pointercancel', done)
      removeEventListener('pointerdown', other)
      if (ev.type !== 'pointerup' || Math.hypot(ev.clientX - at.x, ev.clientY - at.y) > TAP_PX || ev.timeStamp - at.t > TAP_MS) return
      tap(at.x, at.y, rect)
    }
    // Un secondo dito (pizzico per lo zoom): non è un tocco.
    const other = () => done(new PointerEvent('pointercancel'))
    addEventListener('pointerup', done)
    addEventListener('pointercancel', done)
    setTimeout(() => addEventListener('pointerdown', other), 0)
  }

  const tap = (cx: number, cy: number, rect: DOMRect) => {
    // Primo tocco fuori da una casella in uso: chiude solo quella.
    if (selected) {
      ;(document.activeElement as HTMLElement | null)?.blur()
      return setSelected(undefined)
    }
    const size = t.textSize
    const x = Math.min((cx - rect.left) / rect.width, 1 - NEW_W)
    // La prima riga centrata sul punto toccato.
    const y = (cy - rect.top - (size * rect.width * 1.4) / 2) / rect.height
    const id = newId()
    const r4 = (n: number) => Math.round(Math.max(0, n) * 10000) / 10000
    putText(lessonId, target, { id, x: r4(x), y: r4(y), w: NEW_W, text: '', color: tokenColor(t.color), size, ts: Math.round(now() * 100) / 100 })
      .then(() => inkSaved(), inkSaved)
    setSelected(id)
    setFocusId(id)
  }

  if (!active && !boxes.length) return null
  return (
    <div ref={ref} className={`ink-texts${active ? ' on' : ''}`} onPointerDown={onPointerDown}>
      {boxes.map((b) => (
        <TextItem
          key={b.id}
          box={b}
          active={active}
          selected={selected === b.id}
          autoFocus={focusId === b.id}
          layer={ref}
          onSelect={() => setSelected(b.id)}
          onSave={(box) => void putText(lessonId, target, box).then(() => inkSaved(), inkSaved)}
          onRemove={() => {
            if (selected === b.id) setSelected(undefined)
            void removeText(target, b.id).then(() => inkSaved(), inkSaved)
          }}
        />
      ))}
    </div>
  )
}
