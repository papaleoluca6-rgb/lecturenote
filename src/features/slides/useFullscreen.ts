import { useEffect, useState, type RefObject } from 'react'

/**
 * Slide a schermo intero: l'elemento `ref` copre tutto (CSS) e, se il browser lo consente, va anche in schermo intero
 * di sistema (spariscono le barre di Android). Il tasto Indietro di Android esce dallo schermo intero e anche da qui.
 */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const onChange = () => { if (document.fullscreenElement !== ref.current) setOn(false) }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [ref])

  const toggle = () => {
    const el = ref.current
    try {
      if (!on) void el?.requestFullscreen?.().catch(() => {})
      else if (document.fullscreenElement === el) void document.exitFullscreen().catch(() => {})
    } catch {
      // schermo intero di sistema non disponibile: resta quello via CSS
    }
    setOn(!on)
  }
  return [on, toggle] as const
}
