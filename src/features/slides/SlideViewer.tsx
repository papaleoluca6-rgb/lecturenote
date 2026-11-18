import { useEffect, useRef, type ReactNode } from 'react'
import type { Slide } from '../../db/schema'
import { useBlobUrl } from '../../lib/useBlobUrl'
import { useFitSize } from './useFitSize'
import { useZoom } from './useZoom'
import { Icon } from '../../lib/Icon'

interface Props {
  slide: Slide
  index: number
  total: number
  onGo: (index: number) => void
  /** Livello sopra la slide (penna): segue zoom e spostamento perché sta nello stesso riquadro. */
  overlay?: ReactNode
  /** Altri comandi nella stessa riga di ‹ ›, per lasciare più spazio alla slide. */
  tools?: ReactNode
}

/** Slide grande: pizzico per lo zoom, doppio tocco, scorrimento laterale o frecce per sfogliare. */
export function SlideViewer({ slide, index, total, onGo, overlay, tools }: Props) {
  const url = useBlobUrl(slide.id, slide.image)
  const stageRef = useRef<HTMLDivElement>(null)
  const fit = useFitSize(stageRef, slide.width, slide.height)
  const go = (dir: 1 | -1) => {
    const n = index + dir
    if (n >= 0 && n < total) onGo(n)
  }
  const zoom = useZoom(go)
  const { reset } = zoom

  // Lo zoom si azzera da solo cambiando slide: il pannello monta il viewer con key={slide.id}.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      // Il pannello resta montato anche su altre schede: senza questo controllo le frecce sfoglierebbero (e aggancerebbero) slide invisibili.
      if (!stageRef.current?.offsetParent) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') go(1)
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  return (
    <div className="sl-viewer">
      <div ref={stageRef} className={`sl-stage${zoom.zoomed ? ' zoomed' : ''}`} {...zoom.handlers}>
        {fit && (
          <div className="sl-page" style={{ width: fit.w, height: fit.h, ...zoom.style }}>
            {url && <img className="sl-img" src={url} alt={`${slide.deckName}, slide ${index + 1}`} draggable={false} />}
            {overlay}
          </div>
        )}
      </div>
      <div className="sl-nav">
        <button className="ui-btn icon-only" onClick={() => go(-1)} disabled={index === 0} aria-label="Slide precedente"><Icon name="prev" /></button>
        <span className="sl-count mono">{index + 1} / {total}</span>
        <button className="ui-btn icon-only" onClick={() => go(1)} disabled={index === total - 1} aria-label="Slide successiva"><Icon name="next" /></button>
        {zoom.zoomed && <button className="ui-btn" onClick={reset}><Icon name="shrink" /> Adatta</button>}
        {tools}
      </div>
    </div>
  )
}
