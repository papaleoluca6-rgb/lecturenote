import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import { db, type Id, type Sec } from '../../db/schema'
import { fmtSecs } from '../../lib/time'
import { SegmentList } from './SegmentList'
import { useRecorder } from './useRecorder'
import './recording.css'

const STATE_LABEL = { idle: 'Pronto', recording: 'Registrazione', paused: 'In pausa' } as const

/** Elimina la lezione se non contiene nulla (né audio, slide, note o pagine a penna). */
async function dropIfEmpty(lessonId: Id): Promise<void> {
  await db.transaction('rw', db.lessons, db.audio, db.slides, db.notes, db.ink, async () => {
    const audio = await db.audio.where('lessonId').equals(lessonId).count()
    const slides = await db.slides.where('lessonId').equals(lessonId).count()
    const notes = await db.notes.where('lessonId').equals(lessonId).count()
    const ink = await db.ink.where('lessonId').equals(lessonId).count()
    if (audio + slides + notes + ink === 0) await db.lessons.delete(lessonId)
  })
}

/** Orologio della lezione passato ai pannelli ospitati (slide, poi note e penna) per agganciarsi al tempo. */
export interface LessonClock {
  recording: boolean
  now: () => Sec
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

  if (lesson === undefined) return <main className="rec"><p className="rec-muted">Caricamento…</p></main>

  return (
    <main className="rec">
      <header className="rec-top">
        <button className="rec-btn" onClick={() => void close()}>← Libreria</button>
        <div className="rec-title">
          <input
            className="rec-input"
            defaultValue={lesson.title}
            aria-label="Titolo della lezione"
            onBlur={(e) => rename(e.target.value)}
          />
          <span className="rec-muted">{course?.name}</span>
        </div>
      </header>

      <section className={`rec-panel ${r.state}`} aria-live="polite">
        <span className="rec-state">
          <span className="rec-dot" aria-hidden /> {STATE_LABEL[r.state]}
        </span>
        <span className="rec-timer mono">{fmtSecs(r.elapsed)}</span>
        {r.state !== 'idle' && (
          <span className="rec-muted">{r.wakeLock ? 'Schermo sempre acceso' : 'Lo schermo può spegnersi: tieni il tablet attivo'}</span>
        )}
        {r.error && <p className="rec-error" role="alert">{r.error}</p>}

        <div className="rec-controls">
          {r.state === 'idle' && (
            <button className="rec-btn big record" onClick={() => void r.start()}>
              {r.elapsed > 0 ? '● Continua registrazione' : '● Registra'}
            </button>
          )}
          {r.state === 'recording' && <button className="rec-btn big" onClick={r.pause}>❚❚ Pausa</button>}
          {r.state === 'paused' && <button className="rec-btn big record" onClick={r.resume}>● Riprendi</button>}
          {r.state !== 'idle' && <button className="rec-btn big" onClick={() => void r.stop()}>■ Ferma</button>}
        </div>
      </section>

      {panels?.({ recording: r.state !== 'idle', now: r.elapsedSec, onFlush })}

      {r.state === 'idle' && <SegmentList lessonId={lessonId} />}
    </main>
  )
}
