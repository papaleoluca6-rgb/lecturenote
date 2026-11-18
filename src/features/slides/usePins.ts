import { useEffect, useRef, useState } from 'react'
import type { Id, Sec } from '../../db/schema'
import { addPin } from './data'

/** Attesa prima di salvare: sfogliando veloce si aggancia solo la slide su cui ci si ferma. */
const SETTLE_MS = 1200

/** Aggancio in sospeso: `ts` è il momento del primo cambio della raffica, così l'attesa non sposta il tempo. */
class PinBuffer {
  private pending: { slideId: Id; ts: Sec } | null = null
  private timer = 0
  private readonly lessonId: Id
  constructor(lessonId: Id) {
    this.lessonId = lessonId
  }

  push(slideId: Id, ts: () => Sec): void {
    if (this.pending) this.pending.slideId = slideId
    else this.pending = { slideId, ts: ts() }
    window.clearTimeout(this.timer)
    this.timer = window.setTimeout(() => this.flush(), SETTLE_MS)
  }

  flush(): void {
    window.clearTimeout(this.timer)
    const p = this.pending
    this.pending = null
    if (p) void addPin(this.lessonId, p.slideId, p.ts)
  }
}

/** Durante la registrazione (`active`) ogni cambio di slide crea un SlidePin sulla timeline della lezione. */
export function useSlidePins(lessonId: Id, slideId: Id | undefined, active: boolean, now: () => Sec): void {
  const [buf] = useState(() => new PinBuffer(lessonId))
  const nowRef = useRef(now)
  useEffect(() => {
    nowRef.current = now
  })

  useEffect(() => {
    if (active && slideId) buf.push(slideId, () => nowRef.current())
    else buf.flush()
  }, [buf, slideId, active])

  // Chiudendo la schermata si salva subito l'aggancio in sospeso.
  useEffect(() => () => buf.flush(), [buf])
}
