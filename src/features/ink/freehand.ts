import { getStroke } from 'perfect-freehand'
import type { Stroke } from '../../db/schema'

/** Larghezza del sistema di coordinate SVG; l'altezza segue le proporzioni della pagina. `Stroke.size` è in queste unità. */
export const VB_W = 1000

/** Spessori disponibili (unità su VB_W). */
export const SIZES = { fine: 2.5, medio: 5, spesso: 10 } as const
export const HIGHLIGHTER_SIZE = 24

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
  const outline = getStroke(pts, {
    size: s.size,
    thinning: hl ? 0 : 0.6,
    smoothing: 0.5,
    streamline: 0.45,
    simulatePressure: !hl && noPressure(s),
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

/** Il passaggio della gomma da `a` a `b` (normalizzati) tocca il tratto? La gomma cancella tratti interi. */
export function hitsStroke(s: Stroke, a: [number, number], b: [number, number], vbH: number, radius: number): boolean {
  const lim = radius + s.size / 2
  return s.points.some(([x, y]) => distToSegment(x * VB_W, y * vbH, a[0] * VB_W, a[1] * vbH, b[0] * VB_W, b[1] * vbH) <= lim)
}
