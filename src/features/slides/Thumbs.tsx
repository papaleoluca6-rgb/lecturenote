import { useEffect, useRef } from 'react'
import type { Id, Sec, Slide } from '../../db/schema'
import { fmtSecs } from '../../lib/time'
import { useBlobUrl } from '../../lib/useBlobUrl'

function Thumb({ slide, n, active, shownAt, onPick }: { slide: Slide; n: number; active: boolean; shownAt?: Sec; onPick: () => void }) {
  const url = useBlobUrl(slide.id, slide.thumb ?? slide.image)
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [active])
  return (
    <button ref={ref} className={`sl-thumb${active ? ' active' : ''}`} onClick={onPick} aria-label={`Slide ${n}`} aria-current={active}>
      {url && <img src={url} alt="" loading="lazy" decoding="async" draggable={false} />}
      <span className="sl-thumb-n mono">{n}</span>
      {shownAt !== undefined && <span className="sl-thumb-ts mono">{fmtSecs(shownAt)}</span>}
    </button>
  )
}

/** Barra delle miniature; mostra anche quando ogni slide è comparsa durante la registrazione. */
export function Thumbs({ slides, current, shown, onPick }: { slides: Slide[]; current: number; shown: Map<Id, Sec>; onPick: (i: number) => void }) {
  return (
    <div className="sl-thumbs" role="list">
      {slides.map((s, i) => (
        <Thumb key={s.id} slide={s} n={i + 1} active={i === current} shownAt={shown.get(s.id)} onPick={() => onPick(i)} />
      ))}
    </div>
  )
}
