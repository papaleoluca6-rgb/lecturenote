import { getStroke } from 'perfect-freehand'
import type { Stroke } from '../../db/schema'

/** Larghezza del sistema di coordinate SVG; l'altezza segue le proporzioni della pagina. `Stroke.size` è in queste unità. */
export const VB_W = 1000

/** Spessori disponibili (unità su VB_W). */
export const SIZES = { fine: 2.5, medio: 5, spesso: 10 } as const
export const HIGHLIGHTER_SIZE = 24
/** Raggio della gomma (unità su VB_W). */
export const ERASER_R = 12
/** Con la pressione vera, la S Pen leggera fa già un tratto pieno (curva che sale in fretta). */
const penEasing = (t: number) => Math.sin((t * Math.PI) / 2)

/** Tratto senza pressione reale (mouse, dito): tutti i punti a 0.5. */
const noPressure = (s: Stroke) => s.points.every((p) => p[2] === 0.5)

function pathFromOutline(pts: number[][]): string {
  if (pts.length < 2) return ''
  const r = (n: number) => Math.round(n * 10) / 10
  let d = `M${r(pts[0][0])},${r(pts[0][1])}Q`
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % pts.length]
    d += `${r(x0)},${r(y0)} ${r((x0 + x1) / 2)},${r((y0 + y1) / 2)} `
  }
  return d + 'Z'
}

/** Contorno SVG del tratto (perfect-freehand), in coordinate VB_W × vbH. */
export function strokePath(s: Stroke, vbH: number, done = true): string {
  const pts = s.points.map(([x, y, p]) => [x * VB_W, y * vbH, p])
  const hl = s.tool === 'highlighter'
  const simulated = noPressure(s)
  const outline = getStroke(pts, {
    size: s.size,
    thinning: hl ? 0 : simulated ? 0.6 : 0.55,
    smoothing: 0.5,
    streamline: hl ? 0.5 : 0.35,
    simulatePressure: !hl && simulated,
    ...(!hl && !simulated ? { easing: penEasing } : {}),
    last: done,
  })
  return pathFromOutline(outline)
}

/** Distanza del punto p dal segmento a–b. */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Riquadro [x0, y0, x1, y1] dei punti del tratto (normalizzati), da calcolare una volta per pagina. */
export type Box = [number, number, number, number]
export function strokeBox(s: Stroke): Box {
  const b: Box = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of s.points) {
    if (x < b[0]) b[0] = x
    if (y < b[1]) b[1] = y
    if (x > b[2]) b[2] = x
    if (y > b[3]) b[3] = y
  }
  return b
}

/** Il segmento della gomma a–b può toccare il tratto? Confronto veloce col riquadro allargato di raggio + mezzo spessore. */
export function nearBox(box: Box, s: Stroke, a: [number, number], b: [number, number], vbH: number, radius: number): boolean {
  const mx = (radius + s.size / 2) / VB_W
  const my = (radius + s.size / 2) / vbH
  return Math.min(a[0], b[0]) <= box[2] + mx && Math.max(a[0], b[0]) >= box[0] - mx && Math.min(a[1], b[1]) <= box[3] + my && Math.max(a[1], b[1]) >= box[1] - my
}

/** Il passaggio della gomma da `a` a `b` (normalizzati) tocca il tratto? La gomma cancella tratti interi. */
export function hitsStroke(s: Stroke, a: [number, number], b: [number, number], vbH: number, radius: number): boolean {
  const lim = radius + s.size / 2
  return s.points.some(([x, y]) => distToSegment(x * VB_W, y * vbH, a[0] * VB_W, a[1] * vbH, b[0] * VB_W, b[1] * vbH) <= lim)
}
