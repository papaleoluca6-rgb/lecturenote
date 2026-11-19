// File dei modelli offline (riconoscimento vocale e traduzione): si scaricano una volta (in Cina con la VPN)
// e restano nella Cache del browser, così dopo funzionano senza rete. Non passano dal service worker dell'app.

const CACHE = 'lecturenote-models-v1'

export interface ModelFile {
  /** Nome breve mostrato nella prova. */
  name: string
  url: string
  /** Dimensione da scaricare in byte (per la barra di avanzamento). */
  size?: number
  /** File compresso gzip: si decomprime scaricandolo e in cache va già pronto. */
  gz?: boolean
}

export type Progress = (done: number, total: number, file: string) => void

/** true se il file è già nella cache. */
export async function isCached(url: string): Promise<boolean> {
  const c = await caches.open(CACHE)
  return !!(await c.match(url))
}

/** Scarica i file mancanti, uno alla volta, con avanzamento complessivo in byte. */
export async function downloadAll(files: ModelFile[], onProgress: Progress): Promise<void> {
  const c = await caches.open(CACHE)
  const total = files.reduce((s, f) => s + (f.size ?? 0), 0)
  let done = 0
  for (const f of files) {
    if (await c.match(f.url)) {
      done += f.size ?? 0
      onProgress(done, total, f.name)
      continue
    }
    const res = await fetch(f.url)
    if (!res.ok || !res.body) throw new Error(`${f.name}: HTTP ${res.status}`)
    const reader = res.body.getReader()
    const parts: Uint8Array[] = []
    for (;;) {
      const { done: end, value } = await reader.read()
      if (end) break
      parts.push(value)
      done += value.length
      onProgress(done, total, f.name)
    }
    const type = f.gz ? 'application/octet-stream' : (res.headers.get('content-type') ?? 'application/octet-stream')
    let blob = new Blob(parts as BlobPart[], { type })
    // Alcuni server (es. quello di sviluppo) lo mandano già decompresso: si controllano i primi byte di gzip (1f 8b).
    const head = parts[0] ?? new Uint8Array()
    if (f.gz && head[0] === 0x1f && head[1] === 0x8b) blob = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob()
    await c.put(f.url, new Response(blob, { headers: { 'content-type': type } }))
  }
}

/** Contenuto di un file già scaricato (errore se manca: prima va chiamato downloadAll). */
export async function cachedBlob(url: string): Promise<Blob> {
  const res = await (await caches.open(CACHE)).match(url)
  if (!res) throw new Error(`File non scaricato: ${url}`)
  return res.blob()
}

/** Spazio occupato dai modelli, in byte. */
export async function cacheSize(): Promise<number> {
  const c = await caches.open(CACHE)
  let n = 0
  for (const req of await c.keys()) n += (await (await c.match(req))?.blob())?.size ?? 0
  return n
}

export const clearModels = () => caches.delete(CACHE)
