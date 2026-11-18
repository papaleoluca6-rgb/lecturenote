import { useEffect, useState, type RefObject } from 'react'

/** Dimensione in pixel di una pagina w×h adattata (contain) al riquadro `ref`, aggiornata quando il riquadro cambia. */
export function useFitSize(ref: RefObject<HTMLElement | null>, w: number, h: number) {
  const [fit, setFit] = useState<{ w: number; h: number }>()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const k = Math.min(el.clientWidth / w, el.clientHeight / h)
      setFit({ w: Math.floor(w * k), h: Math.floor(h * k) })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, w, h])
  return fit
}
