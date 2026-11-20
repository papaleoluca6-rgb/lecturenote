// Utility per immagini e canvas condivise da slide (import PDF e immagini) e note (foto).

/** Decodifica un'immagine da un Blob (l'URL temporaneo viene liberato subito dopo). */
export function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  const img = new Image()
  return new Promise<HTMLImageElement>((resolve, reject) => {
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Immagine non leggibile'))
    img.src = url
  }).finally(() => URL.revokeObjectURL(url))
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Conversione immagine non riuscita'))), type, quality),
  )
}

/** Libera subito la memoria della canvas (su Chrome Android non aspetta il garbage collector). */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
}

/** Disegna una sorgente in una canvas nuova di dimensione w×h, con sfondo bianco (i PNG trasparenti diventano leggibili). */
export function drawScaled(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Canvas non disponibile')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(src, 0, 0, c.width, c.height)
  return c
}
