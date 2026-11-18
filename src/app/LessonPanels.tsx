import { useState } from 'react'
import type { Id } from '../db/schema'
import { InkLayer } from '../features/ink/InkLayer'
import { InkToolbar } from '../features/ink/InkToolbar'
import { NotebookPanel } from '../features/ink/NotebookPanel'
import type { LessonClock } from '../features/recording/RecordingScreen'
import { SlidesPanel } from '../features/slides/SlidesPanel'

type Tab = 'slides' | 'notebook'

/** Pannelli della lezione sotto il registratore: slide (con la penna sopra) e pagine bianche. */
export function LessonPanels({ lessonId, clock }: { lessonId: Id; clock: LessonClock }) {
  const [tab, setTab] = useState<Tab>('slides')
  return (
    <>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'slides'} className={`tab${tab === 'slides' ? ' on' : ''}`} onClick={() => setTab('slides')}>Slide</button>
        <button role="tab" aria-selected={tab === 'notebook'} className={`tab${tab === 'notebook' ? ' on' : ''}`} onClick={() => setTab('notebook')}>Pagine bianche</button>
      </div>
      <InkToolbar />
      {/* Entrambi restano montati: cambiando scheda la slide corrente non si perde (e non si crea un aggancio falso). */}
      <div hidden={tab !== 'slides'}>
        <SlidesPanel
          lessonId={lessonId}
          recording={clock.recording}
          now={clock.now}
          overlay={(slide) => <InkLayer lessonId={lessonId} target={{ slideId: slide.id }} width={slide.width} height={slide.height} now={clock.now} />}
        />
      </div>
      <div hidden={tab !== 'notebook'}>
        <NotebookPanel lessonId={lessonId} now={clock.now} />
      </div>
    </>
  )
}
