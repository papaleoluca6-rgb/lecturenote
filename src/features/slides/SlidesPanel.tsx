import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import type { Id, Sec, Slide } from '../../db/schema'
import { deleteDeck, firstShown, importFiles, listSlides } from './data'
import { SlideViewer } from './SlideViewer'
import { Thumbs } from './Thumbs'
import { useSlidePins } from './usePins'
import './slides.css'
import { Icon } from '../../lib/Icon'

interface Props {
  lessonId: Id
  /** true mentre si registra (anche in pausa): ogni cambio di slide viene agganciato al tempo. */
  recording: boolean
  /** Posizione attuale sulla timeline della lezione. */
  now: () => Sec
  /** Livello da sovrapporre alla slide corrente (la penna, composta da app/). */
  overlay?: (slide: Slide) => ReactNode
}

/** Slide della lezione: import PDF/immagini, viewer, miniature, aggancio al tempo durante la registrazione. */
export function SlidesPanel({ lessonId, recording, now, overlay }: Props) {
  const slides = useLiveQuery(() => listSlides(lessonId), [lessonId])
  const shown = useLiveQuery(() => firstShown(lessonId), [lessonId]) ?? new Map<Id, Sec>()
  const [currentId, setCurrentId] = useState<Id>()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [thumbs, setThumbs] = useState(false)

  const list = slides ?? []
  const found = list.findIndex((s) => s.id === currentId)
  const index = found >= 0 ? found : 0
  const slide = list[index]
  useSlidePins(lessonId, slide?.id, recording, now)

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setError('')
    try {
      const first = await importFiles(lessonId, [...files], setBusy)
      if (first) setCurrentId(first)
      else setError('Nessun PDF o immagine riconosciuto.')
    } catch (err) {
      console.error(err)
      setError('Import non riuscito: il file potrebbe essere danneggiato o protetto da password.')
    } finally {
      setBusy('')
    }
  }

  const removeDeck = async () => {
    if (!slide || !confirm(`Eliminare tutte le slide di «${slide.deckName}»?`)) return
    await deleteDeck(lessonId, slide.deckName)
    setCurrentId(undefined)
  }

  const importBtn = (
    <label className={`ui-btn${slide ? ' icon-only' : ' primary'}${busy ? ' disabled' : ''}`} aria-label="Importa PDF o immagini" title="Importa PDF o immagini">
      <Icon name="upload" />{!slide && ' PDF o immagini'}
      <input type="file" accept="application/pdf,.pdf,image/*" multiple hidden disabled={!!busy} onChange={(e) => { void onFiles(e.target.files); e.target.value = '' }} />
    </label>
  )

  return (
    <section className="sl" aria-label="Slide">
      {!slide && (
        <header className="sl-bar">
          <h2 className="sl-title">Slide</h2>
          {importBtn}
        </header>
      )}
      {busy && <p className="sl-muted" role="status">{busy}</p>}
      {error && <p className="sl-error" role="alert">{error}</p>}

      {slide ? (
        <>
          <SlideViewer
            key={slide.id}
            slide={slide}
            index={index}
            total={list.length}
            onGo={(i) => setCurrentId(list[i].id)}
            overlay={overlay?.(slide)}
            tools={
              <>
                <span className="sl-deck" title={slide.deckName}>{slide.deckName}</span>
                {recording && <span className="ui-badge rec" title="Cambi di slide agganciati al tempo"><Icon name="clock" size={14} /> agganciate</span>}
                <button className="ui-btn icon-only" aria-pressed={thumbs} onClick={() => setThumbs(!thumbs)} aria-label="Miniature" title="Miniature"><Icon name="grid" /></button>
                {importBtn}
                {!busy && <button className="ui-btn icon-only danger" onClick={() => void removeDeck()} aria-label="Elimina presentazione" title="Elimina presentazione"><Icon name="trash" /></button>}
              </>
            }
          />
          {thumbs && <Thumbs slides={list} current={index} shown={shown} onPick={(i) => setCurrentId(list[i].id)} />}
        </>
      ) : (
        slides && !busy && <div className="ui-empty"><Icon name="slides" size={32} /><p>Importa le slide del docente (PDF o foto): durante la registrazione ogni cambio di slide resta legato al punto dell'audio.</p></div>
      )}
    </section>
  )
}
