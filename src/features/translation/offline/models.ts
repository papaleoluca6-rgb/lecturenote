// File dei modelli offline (riconoscimento vocale e traduzione): si scaricano una volta e restano nella Cache
// del browser, così dopo funzionano senza rete. Non passano dal service worker dell'app.
//
// Pensato per la rete lenta e instabile della Cina: i file dell'app sono divisi in pezzi da 8 MB (scripts/pack-model.mjs),
// ogni pezzo si salva appena arriva, se la rete si ferma per 30 s si riprova, e chiudendo la pagina si riparte
// dai pezzi già scaricati. I file compressi (gzip) si decomprimono una volta finiti.

const CACHE = 'lecturenote-models-v2'
const OLD_CACHE = 'lecturenote-models-v1'
/** Senza nemmeno un byte per questo tempo, il pezzo si considera bloccato e si riprova. */
const STALL_MS = 30_000
const TRIES = 5

export interface ModelFile {
  /** Nome breve mostrato nella prova. */
  name: string
  /** Indirizzo del file (anche chiave nella cache). Con `parts`, i pezzi sono `${url}.part00`, `.part01`, … */
  url: string
  /** Byte da scaricare in tutto (per la barra di avanzamento). */
  size: number
  /** Numero di pezzi (file dell'app, compressi gzip). Assente = un file unico, da un sito esterno. */
  parts?: number
}

export interface Progress {
  done: number
  total: number
  file: string
  /** Byte al secondo negli ultimi secondi. */
  speed: number
  /** Messaggio quando un pezzo non arriva e si riprova. */
  retry?: string
}

const partUrl = (f: ModelFile, i: number) => (f.parts ? `${f.url}.part${String(i).padStart(2, '0')}` : f.url)
const host = (url: string) => new URL(url, location.href).host

/** true se il file è già pronto nella cache. */
export async function isCached(url: string): Promise<boolean> {
  return !!(await (await caches.open(CACHE)).match(url))
}

/**
 * Scarica un pezzo; si interrompe se per STALL_MS non arriva niente. `onBytes` a ogni blocco ricevuto.
 * Con `keep` (file unico esterno) i byte già arrivati restano lì tra un tentativo e l'altro e si chiede solo il resto
 * (Range); se il server rimanda tutto il file (200 invece di 206) si riparte da zero.
 */
async function fetchPart(url: string, onBytes: (n: number) => void, keep?: Uint8Array[]): Promise<Blob> {
  const ctrl = new AbortController()
  let timer = window.setTimeout(() => ctrl.abort(), STALL_MS)
  const chunks = keep ?? []
  const have = chunks.reduce((s, c) => s + c.length, 0)
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store', headers: have ? { Range: `bytes=${have}-` } : undefined })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
    if (have && res.status !== 206) {
      chunks.length = 0
      onBytes(-have)
    }
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      window.clearTimeout(timer)
      timer = window.setTimeout(() => ctrl.abort(), STALL_MS)
      chunks.push(value)
      onBytes(value.length)
    }
    return new Blob(chunks as BlobPart[])
  } catch (e) {
    throw new Error(ctrl.signal.aborted ? `nessun dato da ${host(url)} per ${STALL_MS / 1000} s` : `${host(url)}: ${(e as Error).message}`)
  } finally {
    window.clearTimeout(timer)
  }
}

/** true se il tentativo è stato interrotto per mancanza di dati (non un errore di rete). */
const ctrlAborted = (e: unknown) => e instanceof Error && e.message.startsWith('nessun dato')

/** Unisce i pezzi e, se è gzip (primi byte 1f 8b), decomprime. */
async function assemble(parts: Blob[]): Promise<Blob> {
  const all = new Blob(parts)
  const head = new Uint8Array(await all.slice(0, 2).arrayBuffer())
  if (head[0] !== 0x1f || head[1] !== 0x8b) return all
  return new Response(all.stream().pipeThrough(new DecompressionStream('gzip'))).blob()
}

/** Scarica i file mancanti, un pezzo alla volta, con riprova automatica e ripresa. */
export async function downloadAll(files: ModelFile[], onProgress: (p: Progress) => void): Promise<void> {
  const c = await caches.open(CACHE)
  const total = files.reduce((s, f) => s + f.size, 0)
  let done = 0
  // Velocità: byte arrivati nella finestra degli ultimi 5 s.
  const window5: [number, number][] = []
  const report = (file: string, retry?: string) => {
    const now = performance.now()
    while (window5.length && now - window5[0][0] > 5000) window5.shift()
    const bytes = window5.reduce((s, [, n]) => s + n, 0)
    const span = window5.length ? Math.max(1, now - window5[0][0]) / 1000 : 1
    onProgress({ done, total, file, speed: bytes / span, retry })
  }

  for (const f of files) {
    if (await c.match(f.url)) {
      done += f.size
      report(f.name)
      continue
    }
    const count = f.parts ?? 1
    const blobs: Blob[] = []
    for (let i = 0; i < count; i++) {
      const key = partUrl(f, i)
      // Pezzo già salvato in una volta precedente (solo per i file a pezzi: un file unico si salva intero).
      // La Cache ignora il «#pezzo» nel confronto: la chiave è l'URL del pezzo, comunque diversa dal file finale.
      const saved = f.parts ? await c.match(`${key}#pezzo`) : undefined
      if (saved) {
        const b = await saved.blob()
        blobs.push(b)
        done += b.size
        report(f.name)
        continue
      }
      // File unico esterno: i byte arrivati si tengono e il tentativo successivo riprende da lì.
      const keep: Uint8Array[] | undefined = f.parts ? undefined : []
      for (let attempt = 1; ; attempt++) {
        let got = 0
        const kept = keep?.reduce((n, x) => n + x.length, 0) ?? 0
        try {
          const b = await fetchPart(key, (n) => {
            got += n
            done += n
            if (n > 0) window5.push([performance.now(), n])
            report(f.name)
          }, keep)
          if (f.parts) await c.put(`${key}#pezzo`, new Response(b))
          blobs.push(b)
          break
        } catch (e) {
          if (!keep) done -= got
          // Ripresa con Range fallita per un errore di rete (es. il controllo CORS dietro la VPN):
          // il tentativo dopo riscarica tutto senza Range, come prima.
          else if (kept && !ctrlAborted(e)) {
            done -= keep.reduce((n, x) => n + x.length, 0)
            keep.length = 0
          }
          if (attempt >= TRIES) throw new Error(`${f.name}: ${(e as Error).message}`)
          report(f.name, `${(e as Error).message}: riprovo (${attempt + 1}/${TRIES})…`)
          await new Promise((r) => window.setTimeout(r, 2000 * attempt))
        }
      }
    }
    // Un pezzo salvato corto o rovinato bloccherebbe il modello per sempre: si butta e alla prossima si riscarica.
    const dropParts = async () => {
      for (let i = 0; f.parts && i < count; i++) await c.delete(`${partUrl(f, i)}#pezzo`)
    }
    const bytes = blobs.reduce((s, b) => s + b.size, 0)
    if (f.parts && bytes !== f.size) {
      await dropParts()
      throw new Error(`${f.name}: pezzi incompleti (${bytes} byte invece di ${f.size}). Premi di nuovo «Scarica»: si riscaricano.`)
    }
    let full: Blob
    try {
      full = await assemble(blobs)
    } catch (e) {
      await dropParts()
      throw new Error(`${f.name}: file rovinato (${(e as Error).message}). Premi di nuovo «Scarica»: si riscarica.`)
    }
    await c.put(f.url, new Response(full, { headers: { 'content-type': 'application/octet-stream' } }))
    await dropParts()
  }
}

/** Contenuto di un file già scaricato (errore se manca: prima va chiamato downloadAll). */
export async function cachedBlob(url: string): Promise<Blob> {
  const res = await (await caches.open(CACHE)).match(url)
  if (!res) throw new Error(`File non scaricato: ${url}`)
  return res.blob()
}

/** Spazio occupato dai modelli, in byte (anche quelli della versione precedente della prova, così si possono togliere). */
export async function cacheSize(): Promise<number> {
  let n = 0
  for (const name of [CACHE, OLD_CACHE]) {
    if (!(await caches.has(name))) continue
    const c = await caches.open(name)
    for (const req of await c.keys()) n += (await (await c.match(req))?.blob())?.size ?? 0
  }
  return n
}

/** Toglie tutti i modelli (anche quelli della versione precedente della prova). */
export async function clearModels(): Promise<void> {
  await caches.delete(CACHE)
  await caches.delete(OLD_CACHE)
}
