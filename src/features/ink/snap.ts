import type { Stroke } from '../../db/schema'
import { VB_W } from './freehand'

// Evidenziatore «che seleziona il testo»: alla fine del tratto, la traccia a mano diventa una fascia
// esatta sulle parole toccate (come una selezione di testo, anche su più righe).

interface Word { x: number; y: number; w: number; h: number; line: number }
interface Line { cy: number; words: Word[] }

/** Parole raggruppate in righe (dall'alto) e ordinate da sinistra. Da calcolare una volta per pagina. */
export function textLines(flat: number[] | undefined): Line[] {
  if (!flat?.length) return []
  const words: Word[] = []
  for (let i = 0; i + 3 < flat.length; i += 4) words.push({ x: flat[i], y: flat[i + 1], w: flat[i + 2], h: flat[i + 3], line: -1 })
  words.sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2))
  const lines: Line[] = []
  for (const wd of words) {
    const cy = wd.y + wd.h / 2
    const last = lines.at(-1)
    if (last && Math.abs(cy - last.cy) < wd.h * 0.4) last.words.push(wd)
    else lines.push({ cy, words: [wd] })
  }
  lines.forEach((l, i) => {
    l.words.sort((a, b) => a.x - b.x)
    l.words.forEach((wd) => (wd.line = i))
  })
  return lines
}

/** Fascia orizzontale da x0 a x1 (normalizzati) alta h, come tratto di evidenziatore. */
function band(base: Stroke, x0: number, x1: number, cy: number, hVb: number): Stroke {
  const size = Math.max(4, hVb)
  // perfect-freehand arrotonda le estremità di metà spessore: si accorciano i punti per restare sulle parole.
  const inset = size / 2 / VB_W
  const a = Math.min(x0 + inset, (x0 + x1) / 2)
  const b = Math.max(x1 - inset, (x0 + x1) / 2)
  const n = 8
  const points = Array.from({ length: n + 1 }, (_, i): [number, number, number] => [Math.round((a + ((b - a) * i) / n) * 10000) / 10000, Math.round(cy * 10000) / 10000, 0.5])
  return { ...base, points, size: Math.round(size * 10) / 10 }
}

/** Spazio tra due parole (in altezze di parola) oltre il quale finisce un blocco di testo, es. tra due colonne. */
const GAP_K = 3

/** Parole di una riga (già ordinate da sinistra) divise in blocchi dove lo spazio supera GAP_K altezze di parola. */
function runs(words: Word[], vbH: number): Word[][] {
  const out: Word[][] = []
  for (const wd of words) {
    const run = out.at(-1)
    const prev = run?.at(-1)
    if (run && prev && (wd.x - prev.x - prev.w) * VB_W <= GAP_K * Math.max(prev.h, wd.h) * vbH) run.push(wd)
    else out.push([wd])
  }
  return out
}

/** Estremi orizzontali [x0, x1] di un gruppo di parole. */
const extent = (ws: Word[]): [number, number] => [Math.min(...ws.map((w) => w.x)), Math.max(...ws.map((w) => w.x + w.w))]

/** Parola sotto il punto (con un po' di tolleranza: il tratto a mano non è mai preciso). */
function hit(lines: Line[], x: number, y: number): Word | undefined {
  for (const l of lines) {
    for (const wd of l.words) {
      const padY = wd.h * 0.3
      const padX = wd.h * 0.15
      if (x >= wd.x - padX && x <= wd.x + wd.w + padX && y >= wd.y - padY && y <= wd.y + wd.h + padY) return wd
    }
  }
  return undefined
}

/**
 * Tratto dell'evidenziatore → fasce sulle parole toccate (una per riga), dalla prima all'ultima parola toccata
 * in ordine di lettura. Senza testo sotto: se il tratto è quasi orizzontale diventa una fascia dritta.
 * Restituisce null se il tratto va lasciato com'è (es. un cerchio o una freccia fatti con l'evidenziatore).
 */
export function snapHighlight(s: Stroke, lines: Line[], vbH: number): Stroke[] | null {
  const hits = s.points.map(([x, y]) => hit(lines, x, y)).filter((w): w is Word => !!w)
  if (hits.length) {
    const order = (w: Word) => w.line * 10 + w.x
    let [first, last] = [hits[0], hits[hits.length - 1]]
    if (order(first) > order(last)) [first, last] = [last, first]
    // Colonna del testo toccato: le fasce restano dentro i blocchi che la attraversano (slide a due colonne).
    const runOf = (w: Word) => runs(lines[w.line].words, vbH).find((r) => r.includes(w)) ?? [w]
    const [a0, a1] = extent(runOf(first))
    const [b0, b1] = extent(runOf(last))
    const c0 = Math.min(a0, b0)
    const c1 = Math.max(a1, b1)
    const out: Stroke[] = []
    for (let li = first.line; li <= last.line; li++) {
      const ws = lines[li].words.filter((w) => (li > first.line || w.x >= first.x) && (li < last.line || w.x <= last.x))
      for (const r of runs(ws, vbH)) {
        const [x0, x1] = extent(r)
        if (x1 < c0 || x0 > c1) continue
        const h = Math.max(...r.map((w) => w.h))
        // Un filo di margine ai lati, come un evidenziatore vero che copre la parola intera.
        const pad = (h * vbH * 0.12) / VB_W
        out.push(band(s, x0 - pad, x1 + pad, lines[li].cy, h * vbH))
      }
    }
    return out.length ? out : null
  }
  // Nessun testo: si raddrizza solo un tratto orizzontale (alto al massimo 1,5 volte lo spessore).
  const xs = s.points.map((p) => p[0])
  const ys = s.points.map((p) => p[1]).sort((a, b) => a - b)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  if ((ys[ys.length - 1] - ys[0]) * vbH > s.size * 1.5 || (x1 - x0) * VB_W < s.size) return null
  return [band(s, x0 - s.size / 2 / VB_W, x1 + s.size / 2 / VB_W, ys[Math.floor(ys.length / 2)], s.size)]
}
