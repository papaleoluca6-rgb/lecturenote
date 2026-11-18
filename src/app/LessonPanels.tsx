import { useEffect, useState } from 'react'
import './lesson.css'
import type { Id } from '../db/schema'
import { InkLayer } from '../features/ink/InkLayer'
import { InkToolbar } from '../features/ink/InkToolbar'
import { NotebookPanel } from '../features/ink/NotebookPanel'
import type { LessonClock } from '../features/recording/RecordingScreen'
import { NotesPanel } from '../features/notes/NotesPanel'
import { SlidesPanel } from '../features/slides/SlidesPanel'
import { ReviewPanel } from '../features/study/ReviewPanel'
import { CaptionsPanel } from '../features/translation/live/CaptionsPanel'
import { Icon, type IconName } from '../lib/Icon'

type Tab = 'slides' | 'notebook' | 'notes' | 'captions' | 'review'
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'slides', label: 'Slide', icon: 'slides' },
  { id: 'notebook', label: 'Pagine', icon: 'pen' },
  { id: 'notes', label: 'Note', icon: 'note' },
  { id: 'captions', label: 'Traduzione', icon: 'translate' },
  { id: 'review', label: 'Ripasso', icon: 'book' },
]

/** Pannelli della lezione sotto il registratore. Le feature si compongono qui (non si importano tra loro). */
/** Schermo intero di sistema (nasconde le barre di Android): facoltativo, se non riesce resta la modalità foglio. */
function fullscreen(on: boolean) {
  try {
    if (on && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {})
    if (!on && document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  } catch {
    // non supportato: va bene lo stesso
  }
}

/** Pannelli della lezione sotto il registratore. Le feature si compongono qui (non si importano tra loro). */
export function LessonPanels({ lessonId, clock }: { lessonId: Id; clock: LessonClock }) {
  const [tab, setTab] = useState<Tab>('slides')
  /** Modalità foglio: nasconde titolo e schede, la pagina prende tutto lo spazio. */
  const [focus, setFocus] = useState(false)
  const ink = tab === 'slides' || tab === 'notebook'
  // Se si esce dallo schermo intero da fuori (tasto Indietro di Android), si esce anche dalla modalità foglio.
  useEffect(() => {
    const on = () => { if (!document.fullscreenElement) setFocus(false) }
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const toggleFocus = () => {
    fullscreen(!focus)
    setFocus(!focus)
  }
  return (
    <div className={`lp${focus && ink ? ' focus' : ''}`}>
      <div className="tabs" role="tablist" aria-label="Sezioni della lezione">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={18} /> <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </div>
      <div className={`lp-work${ink ? ' ink' : ''}`}>
        {ink && <InkToolbar focus={focus} onFocus={toggleFocus} />}
        {/* Slide, pagine, note e traduzione restano montate: cambiando scheda non si perde nulla (né la slide corrente né l'ascolto). */}
        <div className="lp-pane" hidden={tab !== 'slides'}>
          <SlidesPanel
            lessonId={lessonId}
            recording={clock.recording}
            now={clock.now}
            overlay={(slide) => <InkLayer lessonId={lessonId} target={{ slideId: slide.id }} width={slide.width} height={slide.height} now={clock.now} />}
          />
        </div>
        <div className="lp-pane" hidden={tab !== 'notebook'}>
          <NotebookPanel lessonId={lessonId} now={clock.now} />
        </div>
        <div className="lp-pane scroll" hidden={tab !== 'notes'}>
          <NotesPanel lessonId={lessonId} now={clock.now} onFlush={clock.onFlush} />
        </div>
        <div className="lp-pane scroll" hidden={tab !== 'captions'}>
          <CaptionsPanel lessonId={lessonId} recording={clock.recording} running={clock.running} now={clock.now} stream={clock.stream} />
        </div>
        {tab === 'review' && <div className="lp-pane scroll"><ReviewPanel lessonId={lessonId} recording={clock.recording} /></div>}
      </div>
    </div>
  )
}
