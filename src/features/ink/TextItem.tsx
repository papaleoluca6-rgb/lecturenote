import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent, type RefObject } from 'react'
import type { TextBox } from '../../db/schema'
import { Icon } from '../../lib/Icon'

const SAVE_MS = 500
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const r4 = (n: number) => Math.round(n * 10000) / 10000

interface Props {
  box: TextBox
  /** Strumento «Testo» attivo: la casella si può toccare, scrivere, spostare. Altrimenti la penna ci passa sopra. */
  active: boolean
  selected: boolean
  autoFocus: boolean
  layer: RefObject<HTMLDivElement | null>
  onSelect: () => void
  onSave: (box: TextBox) => void
  onRemove: () => void
}

/** Eventi presi dalla casella: il viewer delle slide non deve né zoomare né sfogliare, e il testo non deve perdere il fuoco. */
const own = (e: RPointerEvent) => {
  e.stopPropagation()
  e.preventDefault()
}

/** Una casella di testo sopra la pagina: si scrive dentro, si sposta con la maniglia, si allarga dal bordo destro. */
export function TextItem({ box, active, selected, autoFocus, layer, onSelect, onSave, onRemove }: Props) {
  const [draft, setDraft] = useState(box.text)
  const [seen, setSeen] = useState(box.text)
  /** Posizione e larghezza durante il trascinamento (salvate al rilascio). */
  const [geo, setGeo] = useState<{ x: number; y: number; w: number } | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const timer = useRef(0)
  const [focused, setFocused] = useState(false)
  const latest = useRef({ box, draft, dirty: false })
  useLayoutEffect(() => {
    latest.current.box = box
  }, [box])

  // Il testo è cambiato nel database (es. import): si aggiorna, se non lo si sta scrivendo ora.
  if (box.text !== seen) {
    setSeen(box.text)
    if (!focused) setDraft(box.text)
  }

  const flush = () => {
    clearTimeout(timer.current)
    const l = latest.current
    if (!l.dirty) return
    l.dirty = false
    onSave({ ...l.box, text: l.draft })
  }
  useEffect(() => () => flush(), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Altezza che segue il testo (anche quando la pagina cambia grandezza).
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = '0'
    el.style.height = `${el.scrollHeight}px`
  })

  const change = (text: string) => {
    setDraft(text)
    latest.current.draft = text
    latest.current.dirty = true
    clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, SAVE_MS)
  }
  const remove = () => {
    clearTimeout(timer.current)
    latest.current.dirty = false
    onRemove()
  }
  const blur = () => {
    setFocused(false)
    if (latest.current.draft.trim()) flush()
    else remove()
  }

  /** Trascinamento della maniglia: `mode` sposta la casella o ne cambia la larghezza. */
  const drag = (mode: 'move' | 'widen') => (e: RPointerEvent<HTMLElement>) => {
    own(e)
    const rect = layer.current?.getBoundingClientRect()
    if (!rect) return
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const start = { cx: e.clientX, cy: e.clientY, x: box.x, y: box.y, w: box.w }
    let g = { x: box.x, y: box.y, w: box.w }
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.cx) / rect.width
      const dy = (ev.clientY - start.cy) / rect.height
      g = mode === 'move'
        ? { ...g, x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 0.98) }
        : { ...g, w: clamp(start.w + dx, 0.08, 1 - start.x) }
      setGeo(g)
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      setGeo(null)
      onSave({ ...latest.current.box, text: latest.current.draft, x: r4(g.x), y: r4(g.y), w: r4(g.w) })
      latest.current.dirty = false
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  const { x, y, w } = geo ?? box
  return (
    <div className={`ink-tb${selected && active ? ' sel' : ''}`} style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%` }}>
      <textarea
        ref={area}
        className="ink-tb-text"
        style={{ color: box.color, fontSize: `${box.size * 100}cqw` }}
        value={draft}
        rows={1}
        readOnly={!active}
        tabIndex={active ? 0 : -1}
        autoFocus={autoFocus}
        spellCheck={false}
        aria-label="Casella di testo"
        placeholder={active ? 'Scrivi…' : undefined}
        onPointerDown={(e) => e.stopPropagation()}
        onFocus={() => {
          setFocused(true)
          onSelect()
        }}
        onBlur={blur}
        onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        onChange={(e) => change(e.target.value)}
      />
      {selected && active && (
        <>
          <div className="ink-tb-bar">
            <button className="ui-btn icon-only ink-tb-btn" aria-label="Sposta la casella" title="Trascina per spostare" onPointerDown={drag('move')}>
              <Icon name="move" size={18} />
            </button>
            <button className="ui-btn icon-only ink-tb-btn danger" aria-label="Elimina la casella" title="Elimina la casella" onPointerDown={own} onClick={remove}>
              <Icon name="trash" size={18} />
            </button>
          </div>
          <button className="ui-btn icon-only ink-tb-btn ink-tb-widen" aria-label="Allarga o stringi la casella" title="Trascina per cambiare la larghezza" onPointerDown={drag('widen')}>
            <Icon name="widen" size={18} />
          </button>
        </>
      )}
    </div>
  )
}
