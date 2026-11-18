// Posizione delle parole di una pagina PDF, per l'evidenziatore che «seleziona» il testo.
// Le slide sono salvate come immagini: il testo vero c'è solo al momento dell'import.

interface PdfTextItem {
  str: string
  transform: number[]
  width: number
  fontName?: string
}

/** Larghezza di un testo in un font (unità qualsiasi): serve solo il rapporto tra le lettere. */
export type Measure = (text: string, fontFamily: string) => number

/** Moltiplica due matrici 2D di pdf.js [a, b, c, d, e, f]. */
const mul = (m: number[], n: number[]) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]

/** Caratteri cinesi/giapponesi/coreani e punteggiatura a larghezza piena: ognuno è una «parola». */
const CJK = /[⺀-鿿가-힯豈-﫿＀-￯]/

/**
 * Riquadri delle parole, normalizzati 0..1 sulla pagina: [x, y, w, h, x, y, w, h, …].
 * `vt` = viewport.transform, (w, h) = dimensioni della pagina renderizzata. Testo ruotato o verticale ignorato.
 */
export function wordBoxes(items: unknown[], vt: number[], w: number, h: number, measure?: Measure, styles: Record<string, { fontFamily?: string }> = {}): number[] {
  const out: number[] = []
  const r4 = (n: number) => Math.round(n * 10000) / 10000
  for (const it of items as PdfTextItem[]) {
    if (!it.str?.trim() || !it.transform || !(it.width > 0)) continue
    const t = mul(vt, it.transform)
    if (Math.abs(t[1]) > 0.01 * Math.abs(t[0]) || t[0] <= 0) continue
    const fontH = Math.hypot(t[2], t[3])
    const scaleX = Math.hypot(t[0], t[1]) / Math.hypot(it.transform[0], it.transform[1] || 0)
    const totalW = it.width * scaleX
    const chars = [...it.str]
    // Posizione di ogni lettera: in proporzione alla sua larghezza vera nel font (una «i» è più stretta di una «m»).
    const fam = styles[it.fontName ?? '']?.fontFamily ?? 'sans-serif'
    const full = measure?.(it.str, fam) ?? 0
    const xAt = (i: number) => (full > 0 ? (totalW * measure!(chars.slice(0, i).join(''), fam)) / full : (totalW * i) / chars.length)
    // Riquadro verticale: dal tratto alto delle maiuscole a sotto la linea di base (lettere come g, p).
    const top = t[5] - fontH * 0.85
    const boxH = fontH * 1.1
    let start = -1
    const flush = (end: number) => {
      if (start < 0) return
      const x0 = xAt(start)
      out.push(r4((t[4] + x0) / w), r4(top / h), r4((xAt(end) - x0) / w), r4(boxH / h))
      start = -1
    }
    chars.forEach((ch, i) => {
      if (/\s/.test(ch)) return flush(i)
      if (CJK.test(ch)) {
        flush(i)
        start = i
        return flush(i + 1)
      }
      if (start < 0) start = i
    })
    flush(chars.length)
  }
  return out
}
