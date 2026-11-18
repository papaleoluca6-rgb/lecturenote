import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef } from 'react'
import { db, type Id } from '../../db/schema'
import type { LessonAudio } from '../../lib/lessonAudio'

/** Dopo un cambio di slide a mano, l'audio ci mette un attimo a saltare: in quel tempo non deve riportare indietro la slide. */
const QUIET_MS = 1500

/**
 * "L'audio segue le slide" (solo fuori registrazione): sfogliando, l'audio riparte da quando la slide è stata mostrata
 * (si ferma se la slide non è mai stata mostrata); mentre l'audio scorre, le slide avanzano da sole come a lezione.
 */
export function useAudioSync(lessonId: Id, player: LessonAudio | undefined, on: boolean, slideId: Id | undefined, goTo: (id: Id) => void) {
  const pins = useLiveQuery(() => db.pins.where('lessonId').equals(lessonId).sortBy('ts'), [lessonId])
  const latest = useRef({ pins, slideId, goTo })
  useEffect(() => { latest.current = { pins, slideId, goTo } })
  const quietUntil = useRef(0)
  /** La slide l'ha cambiata l'audio: non bisogna far saltare l'audio a sua volta. */
  const fromAudio = useRef(false)

  // slide → audio
  useEffect(() => {
    if (!on || !player || player.empty || !slideId) return
    if (fromAudio.current) {
      fromAudio.current = false
      return
    }
    quietUntil.current = performance.now() + QUIET_MS
    const first = latest.current.pins?.find((p) => p.slideId === slideId)
    if (first) player.playAt(first.ts)
    else player.pause()
  }, [on, player, slideId])

  // audio → slide
  useEffect(() => {
    if (!on || !player) return
    return player.subscribe(() => {
      if (!player.playing || performance.now() < quietUntil.current) return
      const { pins, slideId: cur, goTo: go } = latest.current
      const pin = pins?.findLast((p) => p.ts <= player.time + 0.05)
      if (pin && pin.slideId !== cur) {
        fromAudio.current = true
        go(pin.slideId)
      }
    })
  }, [on, player])
}
