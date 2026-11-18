import { liveQuery } from 'dexie'
import { useEffect, useReducer, useState } from 'react'
import { db, type Id } from '../db/schema'
import { LessonAudio } from './lessonAudio'

/**
 * Crea il lettore della lezione e lo tiene allineato ai segmenti salvati, senza ridisegnare chi lo possiede.
 * `disabled`: mentre si registra non si riproduce (il microfono registrerebbe anche l'altoparlante).
 */
export function useLessonAudio(lessonId: Id, disabled: boolean): LessonAudio {
  const [player] = useState(() => new LessonAudio())
  useEffect(() => {
    const sub = liveQuery(() => db.audio.where('lessonId').equals(lessonId).sortBy('index')).subscribe({
      next: (segs) => player.setSegments(segs),
      error: (err: unknown) => console.error(err),
    })
    return () => sub.unsubscribe()
  }, [player, lessonId])
  useEffect(() => { if (disabled) player.pause() }, [player, disabled])
  useEffect(() => () => player.dispose(), [player])
  return player
}

/** Ridisegna il componente a ogni avanzamento del lettore (solo chi mostra tempo o play/pausa). */
export function useAudioTick(player: LessonAudio | undefined): void {
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => player?.subscribe(tick), [player])
}
