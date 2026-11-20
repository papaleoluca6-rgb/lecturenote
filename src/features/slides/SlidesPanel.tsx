import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState, type ReactNode } from 'react'
import type { Id, Sec, Slide } from '../../db/schema'
import { deleteDeck, firstShown, importFiles, listSlides } from './data'
import { SlideViewer } from './SlideViewer'
import { Thumbs } from './Thumbs'
import { useSlidePins } from './usePins'
import './slides.css'
import { Icon } from '../../lib/Icon'
import type { LessonAudio } from '../../lib/lessonAudio'
import { SlideAudio } from './SlideAudio'
import { useAudioSync } from './useAudioSync'
import { useFullscreen } from './useFullscreen'
import { useLessonView } from '../../lib/lessonView'

interface Props {
  lessonId: Id
  /** true mentre si registra (anche in pausa): ogni cambio di slide viene agganciato al tempo. */
  recording: boolean
  /** Posizione attuale sulla timeline della lezione. */
  now: () => Sec
  /** Livello da sovrapporre alla slide corrente (la penna, composta da app/). */
  overlay?: (slide: Slide) => ReactNode
  /** Lettore della lezione (da app/): fuori registrazione si riascolta dalle slide. */
  player?: LessonAudio
}

/** Slide della lezione: import PDF/immagini, viewer, miniature, aggancio al tempo durante la registrazione. */
export function SlidesPanel({ lessonId, recording, now, overlay, player }: Props) {
  const slides = useLiveQuery(() => listSlides(lessonId), [lessonId])
  const shown = useLiveQuery(() => firstShown(lessonId), [lessonId]) ?? new Map<Id, Sec>()
  // Ultima slide guardata: rientrando nella lezione si riparte da lì.
  const [currentId, setCurrentId] = useLessonView<Id>(lessonId, 'slide')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [thumbs, setThumbs] = useState(false)
  const [follow, setFollow] = useState(false)
  // Registrando «L'audio segue le slide» si spegne: allo stop l'audio non deve partire da solo.
  if (recording && follow) setFollow(false)
  const rootRef = useRef<HTMLElement>(null)
  const [full, toggleFull] = useFullscreen(rootRef)

  const list = slides ?? []
  const found = list.findIndex((s) => s.id === currentId)
  const index = found >= 0 ? found : 0
  const slide = list[index]
  useSlidePins(lessonId, slide?.id, recording, now)
  useAudioSync(lessonId, player, follow && !recording, slide?.id, setCurrentId)

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setError('')
    try {
      const first = await importFiles(lessonId, [...files], setBusy)
      if (first) setCurrentId(first)
      else setError('Nessun PDF o immagine riconosciuto.')
    } catch (err) {
      console.error(err)
      // Il messaggio vero serve a capire il problema (prima diceva sempre «danneggiato», anche quando mancava la rete).
      const msg = err instanceof Error ? err.message : String(err)
      setError(/password/i.test(msg) ? 'Il PDF è protetto da password: aprilo e salvalo senza password, poi riprova.' : `Import non riuscito (${msg}). Se il file si apre normalmente, riprova; se succede ancora, mandami questo messaggio.`)
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
    <section ref={rootRef} className={`sl${full ? ' full' : ''}`} aria-label="Slide">
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
                {!full && <span className="sl-deck" title={slide.deckName}>{slide.deckName}</span>}
                {recording && !full && <span className="ui-badge rec" title="Cambi di slide agganciati al tempo"><Icon name="clock" size={14} /> agganciate</span>}
                {!recording && player && <SlideAudio player={player} at={shown.get(slide.id)} follow={follow} onFollow={() => setFollow(!follow)} />}
                {!full && (
                  <>
                    <button className="ui-btn icon-only" aria-pressed={thumbs} onClick={() => setThumbs(!thumbs)} aria-label="Miniature" title="Miniature"><Icon name="grid" /></button>
                    {importBtn}
                    {!busy && <button className="ui-btn icon-only danger" onClick={() => void removeDeck()} aria-label="Elimina presentazione" title="Elimina presentazione"><Icon name="trash" /></button>}
                  </>
                )}
                <button className="ui-btn icon-only" aria-pressed={full} onClick={toggleFull} aria-label={full ? 'Esci dallo schermo intero' : 'Schermo intero'} title={full ? 'Esci dallo schermo intero' : 'Schermo intero: solo la slide'}>
                  <Icon name={full ? 'shrink' : 'expand'} />
                </button>
              </>
            }
          />
          {thumbs && !full && <Thumbs slides={list} current={index} shown={shown} onPick={(i) => setCurrentId(list[i].id)} />}
        </>
      ) : (
        slides && !busy && <div className="ui-empty"><Icon name="slides" size={32} /><p>Importa le slide del docente (PDF o foto): durante la registrazione ogni cambio di slide resta legato al punto dell'audio.</p></div>
      )}
    </section>
  )
}
