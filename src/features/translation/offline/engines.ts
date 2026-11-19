import { BERGAMOT_ENGINE, MT_MODELS, SHERPA_ENGINE, type AsrModel, type MtPair } from './catalog'
import { cachedBlob } from './models'

// I due motori offline, ognuno nel suo worker: così usano due core diversi del processore
// e l'interfaccia resta libera anche mentre calcolano.

const buf = async (url: string) => (await cachedBlob(url)).arrayBuffer()
/** Codice del motore come URL locale: il worker lo carica con importScripts anche senza rete. */
const scriptUrl = async (url: string) => URL.createObjectURL(new Blob([await (await cachedBlob(url)).text()], { type: 'text/javascript' }))

export interface Ready {
  ms: number
  heapMB: number
  modelMs?: number
}

interface WorkerMsg {
  type: string
  msg?: string
  [k: string]: unknown
}

/** Avvia il worker e aspetta il messaggio 'ready' (o l'errore). */
function boot(worker: Worker, init: unknown, transfer: Transferable[], onMsg: (m: WorkerMsg) => void): Promise<Ready> {
  return new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
      const m = e.data
      if (m.type === 'ready') resolve(m as unknown as Ready)
      else if (m.type === 'error') reject(new Error(m.msg))
      onMsg(m)
    }
    worker.onerror = (e) => reject(new Error(e.message || 'Errore nel worker'))
    worker.postMessage(init, transfer)
  })
}

export interface AsrEvents {
  partial(text: string): void
  final(text: string): void
  /** Un pezzo di audio è stato elaborato: `end` = secondi di audio fin lì, `ms` = tempo di calcolo. */
  done(end: number, ms: number): void
  ended(): void
  error(msg: string): void
}

/** Riconoscimento vocale sherpa-onnx. */
export class OfflineAsr {
  private readonly worker = new Worker(new URL('./asrWorker.ts', import.meta.url))
  private readonly urls: string[] = []

  async start(model: AsrModel, on: AsrEvents): Promise<Ready> {
    const files = await Promise.all(Object.entries(model.files).map(async ([name, f]) => ({ name, data: await buf(f.url) })))
    const wasm = await buf(SHERPA_ENGINE.wasm.url)
    const glue = await scriptUrl(SHERPA_ENGINE.glue.url)
    const api = await scriptUrl(SHERPA_ENGINE.api.url)
    this.urls.push(glue, api)
    const init = { type: 'init', glue, api, wasm, files, kind: model.kind }
    return boot(this.worker, init, [wasm, ...files.map((f) => f.data)], (m) => {
      if (m.type === 'partial') on.partial(String(m.text))
      else if (m.type === 'final') on.final(String(m.text))
      else if (m.type === 'done') on.done(Number(m.end), Number(m.ms))
      else if (m.type === 'ended') on.ended()
      else if (m.type === 'error') on.error(String(m.msg))
    })
  }

  /** Audio mono a 16 kHz; `end` = secondi di audio inviati fino a questo pezzo compreso. */
  feed(samples: Float32Array, end: number): void {
    this.worker.postMessage({ type: 'audio', samples, end }, [samples.buffer])
  }

  end(): void {
    this.worker.postMessage({ type: 'end' })
  }

  dispose(): void {
    this.worker.terminate()
    this.urls.forEach((u) => URL.revokeObjectURL(u))
  }
}

export interface Translation {
  en: string
  it: string
  msEn: number
  msIt: number
  heapMB: number
}

/** Traduzione Bergamot: cinese→inglese→italiano, inglese→italiano. Le richieste si mettono in coda nel worker. */
export class OfflineMt {
  private readonly worker = new Worker(new URL('./mtWorker.ts', import.meta.url))
  private readonly waiting = new Map<number, (t: Translation) => void>()
  private next = 0
  private url = ''

  async start(onError: (msg: string) => void): Promise<Ready> {
    const pair = async (p: MtPair) => ({ model: await buf(p.model.url), lex: await buf(p.lex.url), vocab: await buf(p.vocab.url) })
    const zhen = await pair(MT_MODELS.zhen)
    const enit = await pair(MT_MODELS.enit)
    const wasm = await buf(BERGAMOT_ENGINE.wasm.url)
    this.url = await scriptUrl(BERGAMOT_ENGINE.glue.url)
    const init = { type: 'init', glue: this.url, wasm, zhen, enit }
    return boot(this.worker, init, [wasm, zhen.model, zhen.lex, zhen.vocab, enit.model, enit.lex, enit.vocab], (m) => {
      if (m.type === 'translated') {
        this.waiting.get(Number(m.id))?.(m as unknown as Translation)
        this.waiting.delete(Number(m.id))
      } else if (m.type === 'error') onError(String(m.msg))
    })
  }

  translate(text: string, from: 'zh' | 'en'): Promise<Translation> {
    const id = this.next++
    return new Promise((resolve) => {
      this.waiting.set(id, resolve)
      this.worker.postMessage({ type: 'translate', id, text, from })
    })
  }

  dispose(): void {
    this.worker.terminate()
    if (this.url) URL.revokeObjectURL(this.url)
  }
}
