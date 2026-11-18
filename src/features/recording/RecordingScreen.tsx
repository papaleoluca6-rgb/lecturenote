import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import { db, lessonTables, type Id, type Sec } from '../../db/schema'
import { Icon } from '../../lib/Icon'
import { fmtSecs } from '../../lib/time'
import { useRecorder } from './useRecorder'
import './recording.css'

const STATE_LABEL = { idle: 'Pronto', recording: 'Registrazione', paused: 'In pausa' } as const

/** Elimina la lezione se non contiene nulla (né audio, slide, note, penna, trascrizione o flashcard). */
async function dropIfEmpty(lessonId: Id): Promise<void> {
  // I soli agganci di slide (pins) e traduzioni non bastano: dipendono da slide e frasi.
  const tables = lessonTables().filter((t) => t !== db.pins && t !== db.translations)
  await db.transaction('rw', [db.lessons, ...tables], async () => {
    for (const t of tables) if (await t.where('lessonId').equals(lessonId).count()) return
    await db.lessons.delete(lessonId)
  })
}

/** Orologio della lezione passato ai pannelli ospitati (slide, note, penna, traduzione) per agganciarsi al tempo. */
export interface LessonClock {
  /** true mentre si registra, anche in pausa. */
  recording: boolean
  /** true solo mentre l'audio scorre (non in pausa). */
  running: boolean
  now: () => Sec
  /** Microfono della registrazione (null da fermo), per chi lavora su blocchi di audio. */
  stream: () => MediaStream | null
  /** Registra una funzione da attendere prima di chiudere la lezione (es. salvare una bozza). Restituisce come annullarla. */
  onFlush: (fn: () => Promise<void>) => () => void
}

interface Props {
  lessonId: Id
  onClose: () => void
  /** Pannelli di altre feature composti da app/ (le feature non si importano tra loro). */
  panels?: (clock: LessonClock) => ReactNode
}

export function RecordingScreen({ lessonId, onClose, panels }: Props) {
  const lesson = useLiveQuery(() => db.lessons.get(lessonId), [lessonId])
  const course = useLiveQuery(() => (lesson ? db.courses.get(lesson.courseId) : undefined), [lesson?.courseId])
  const r = useRecorder(lessonId)
  const [flushers] = useState(() => new Set<() => Promise<void>>())
  const [onFlush] = useState(() => (fn: () => Promise<void>) => {
    flushers.add(fn)
    return () => { flushers.delete(fn) }
  })

  const close = async () => {
    await r.stop()
    // Prima dei controlli sulla lezione vuota: una bozza di nota conta come contenuto.
    await Promise.allSettled([...flushers].map((f) => f()))
    await dropIfEmpty(lessonId)
    onClose()
  }
  const rename = (title: string) => {
    if (title.trim() && title.trim() !== lesson?.title) void db.lessons.update(lessonId, { title: title.trim(), updatedAt: Date.now() })
  }

  if (lesson === undefined) return <main className="rec"><p className="ui-muted">Caricamento…</p></main>

  return (
    <main className="rec">
      <header className={`rec-head ${r.state}`} aria-label="Registratore">
        <button className="ui-btn ghost icon-only" onClick={() => void close()} aria-label="Torna alla libreria">
          <Icon name="back" />
        </button>
        <div className="rec-title">
          <input className="rec-input" defaultValue={lesson.title} aria-label="Titolo della lezione" onBlur={(e) => rename(e.target.value)} />
          {course && <span className="rec-course"><i style={{ background: course.color }} />{course.name}</span>}
        </div>
        <div className="rec-status" aria-live="polite">
          <span className="rec-dot" aria-hidden />
          <span className="rec-state">{STATE_LABEL[r.state]}</span>
          <span className="rec-timer mono">{fmtSecs(r.elapsed)}</span>
        </div>
        <div className="rec-controls">
          {r.state === 'idle' && (
            <button className="ui-btn record" onClick={() => void r.start()}>
              <Icon name="mic" /> {r.elapsed > 0 ? 'Continua' : 'Registra'}
            </button>
          )}
          {r.state === 'recording' && <button className="ui-btn" onClick={r.pause}><Icon name="pause" /> Pausa</button>}
          {r.state === 'paused' && <button className="ui-btn record" onClick={r.resume}><Icon name="mic" /> Riprendi</button>}
          {r.state !== 'idle' && <button className="ui-btn icon-only" onClick={() => void r.stop()} aria-label="Ferma la registrazione" title="Ferma"><Icon name="stop" /></button>}
        </div>
        {r.state !== 'idle' && !r.wakeLock && <p className="rec-hint">Lo schermo può spegnersi: tieni il tablet attivo.</p>}
        {r.error && <p className="rec-hint ui-error" role="alert">{r.error}</p>}
      </header>

      {panels?.({ recording: r.state !== 'idle', running: r.state === 'recording', now: r.elapsedSec, stream: r.stream, onFlush })}
    </main>
  )
}
