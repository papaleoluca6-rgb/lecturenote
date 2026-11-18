/** Lascia respirare l'interfaccia: riprende al prossimo giro dell'event loop. */
export const tick = () => new Promise<void>((r) => setTimeout(r, 0))

/** Aspetta che la coda di un codec WebCodecs scenda sotto max (evento "dequeue" o al massimo 50 ms). */
export async function waitQueue(codec: EventTarget, size: () => number, max: number): Promise<void> {
  while (size() > max) {
    await new Promise<void>((resolve) => {
      const done = () => { clearTimeout(t); codec.removeEventListener('dequeue', done); resolve() }
      const t = setTimeout(done, 50)
      codec.addEventListener('dequeue', done)
    })
  }
}
