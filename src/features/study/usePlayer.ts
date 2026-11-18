import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useReducer, useState } from 'react'
import { db, type Id } from '../../db/schema'
import { LessonAudio } from './player'

/** Lettore della lezione per React: si aggiorna a ogni avanzamento dell'audio. */
export function useLessonPlayer(lessonId: Id, disabled: boolean) {
  const [, tick] = useReducer((n: number) => n + 1, 0)
  const [player] = useState(() => new LessonAudio(tick))
  const segs = useLiveQuery(() => db.audio.where('lessonId').equals(lessonId).sortBy('index'), [lessonId])

  useEffect(() => {
    player.setSegments(segs ?? [])
    tick()
  }, [player, segs])
  // Mentre si registra non si riproduce: il microfono registrerebbe anche l'altoparlante.
  useEffect(() => { if (disabled) player.pause() }, [player, disabled])
  useEffect(() => () => player.dispose(), [player])

  return player
}
