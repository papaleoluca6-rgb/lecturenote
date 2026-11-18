import { useEffect, useState } from 'react'
import type { Id } from '../../db/schema'
import { LessonRecorder, type RecState } from './lessonRecorder'

function errorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError') return 'Permesso del microfono negato. Abilitalo nelle impostazioni del sito in Chrome.'
  if (name === 'NotFoundError') return 'Nessun microfono trovato.'
  if (!window.isSecureContext) return 'Il microfono funziona solo su localhost o HTTPS.'
  return 'Impossibile avviare la registrazione.'
}

/** Stato React attorno a LessonRecorder: tempo trascorso, stato, errori, avviso prima di chiudere la pagina. */
export function useRecorder(lessonId: Id) {
  const [, rerender] = useState(0)
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [rec] = useState(() => {
    const r: LessonRecorder = new LessonRecorder(lessonId, () => {
      rerender((n) => n + 1)
      setElapsed(r.elapsedSec())
    })
    return r
  })
  const state: RecState = rec.state

  useEffect(() => {
    void rec.load().then(() => setElapsed(rec.elapsedSec()))
    return () => void rec.stop()
  }, [rec])

  useEffect(() => {
    if (state === 'idle') return
    const id = window.setInterval(() => {
      setElapsed(rec.elapsedSec())
      void rec.tick()
    }, 250)
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('beforeunload', warn)
    }
  }, [rec, state])

  const start = async () => {
    setError('')
    try {
      await rec.start()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return {
    state,
    elapsed,
    error,
    wakeLock: rec.wake.active,
    /** Posizione esatta sulla timeline (per agganciare slide e note al tempo). */
    elapsedSec: () => rec.elapsedSec(),
    start,
    pause: () => rec.pause(),
    resume: () => rec.resume(),
    stop: () => rec.stop(),
  }
}
