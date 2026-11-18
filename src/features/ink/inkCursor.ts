import { ERASER_R, VB_W } from './freehand'
import { getTool } from './toolStore'

/** Cerchio che segue la S Pen sospesa sopra il foglio: mostra punta, colore e spessore (o l'area della gomma). */
export function showCursor(el: SVGCircleElement | null, x: number, y: number, vbH: number, eraser: boolean): void {
  if (!el) return
  const t = getTool()
  const rubber = eraser || t.tool === 'eraser'
  el.setAttribute('cx', String(Math.round(x * VB_W * 10) / 10))
  el.setAttribute('cy', String(Math.round(y * vbH * 10) / 10))
  el.setAttribute('r', String(rubber ? ERASER_R : Math.max(1.5, t.size / 2)))
  el.classList.toggle('eraser', rubber)
  el.style.fill = rubber ? 'none' : `var(${t.color})`
  el.style.opacity = !rubber && t.tool === 'highlighter' ? '0.5' : '1'
  el.style.display = ''
}

export function hideCursor(el: SVGCircleElement | null): void {
  if (el && el.style.display !== 'none') el.style.display = 'none'
}
