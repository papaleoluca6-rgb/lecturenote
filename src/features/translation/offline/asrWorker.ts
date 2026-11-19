// Worker (classico, senza import) del riconoscimento vocale sherpa-onnx in WebAssembly.
// Riceve il codice del motore e i file del modello già scaricati, li carica in memoria e trascrive
// l'audio a 16 kHz che arriva a pezzi. Ogni pezzo risponde con il tempo di calcolo, per misurare la velocità.

interface Stream {
  acceptWaveform(rate: number, samples: Float32Array): void
}
interface Recognizer {
  createStream(): Stream
  isReady(s: Stream): boolean
  decode(s: Stream): void
  isEndpoint(s: Stream): boolean
  reset(s: Stream): void
  getResult(s: Stream): { text: string }
}
interface Scope {
  postMessage(m: unknown): void
  onmessage: ((e: MessageEvent) => void) | null
  importScripts(...urls: string[]): void
  Module: Record<string, unknown> & { HEAPU8?: Uint8Array }
  FS: { writeFile(p: string, d: Uint8Array): void; unlink(p: string): void }
  createOnlineRecognizer(m: unknown, cfg: unknown): Recognizer
}
const w = self as unknown as Scope

let rec: Recognizer | null = null
let stream: Stream | null = null
let last = ''

const fail = (err: unknown) => w.postMessage({ type: 'error', msg: err instanceof Error ? err.message : String(err) })

/** Configurazione completa (createOnlineRecognizer sostituisce tutta quella predefinita). */
function config(kind: 'transducer' | 'ctc') {
  const none = ''
  return {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: kind === 'transducer'
        ? { encoder: './encoder.onnx', decoder: './decoder.onnx', joiner: './joiner.onnx' }
        : { encoder: none, decoder: none, joiner: none },
      paraformer: { encoder: none, decoder: none },
      zipformer2Ctc: { model: kind === 'ctc' ? './model.onnx' : none },
      nemoCtc: { model: none },
      toneCtc: { model: none },
      tokens: './tokens.txt',
      numThreads: 1,
      provider: 'cpu',
      debug: 0,
      modelType: none,
      modelingUnit: 'cjkchar',
      bpeVocab: none,
    },
    decodingMethod: 'greedy_search',
    maxActivePaths: 4,
    enableEndpoint: 1,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 1.2,
    rule3MinUtteranceLength: 20,
    hotwordsFile: none,
    hotwordsScore: 1.5,
    ctcFstDecoderConfig: { graph: none, maxActive: 3000 },
    ruleFsts: none,
    ruleFars: none,
  }
}

interface Init {
  type: 'init'
  glue: string
  api: string
  wasm: ArrayBuffer
  files: { name: string; data: ArrayBuffer }[]
  kind: 'transducer' | 'ctc'
}

function init(m: Init) {
  const t0 = performance.now()
  w.Module = {
    wasmBinary: m.wasm,
    // Il pacchetto .data della build ufficiale contiene il modello grande: non serve, i file li scriviamo noi.
    getPreloadedPackage: () => new ArrayBuffer(0),
    locateFile: (p: string) => p,
    setStatus: () => {},
    print: () => {},
    printErr: () => {},
    onRuntimeInitialized: () => {
      try {
        for (const f of m.files) {
          try {
            w.FS.unlink(`/${f.name}`)
          } catch {
            // il file non c'era
          }
          w.FS.writeFile(`/${f.name}`, new Uint8Array(f.data))
        }
        const t1 = performance.now()
        rec = w.createOnlineRecognizer(w.Module, config(m.kind))
        stream = rec.createStream()
        const heap = w.Module.HEAPU8?.length ?? 0
        w.postMessage({ type: 'ready', ms: Math.round(performance.now() - t0), modelMs: Math.round(performance.now() - t1), heapMB: Math.round(heap / 1048576) })
      } catch (err) {
        fail(err)
      }
    },
    onAbort: (what: unknown) => fail(`motore interrotto: ${String(what)}`),
  }
  w.importScripts(m.api, m.glue)
}

/** Decodifica quanto è pronto; alla fine di una frase (pausa) la manda come definitiva. */
function step(final: boolean) {
  if (!rec || !stream) return
  while (rec.isReady(stream)) rec.decode(stream)
  const text = rec.getResult(stream).text.trim()
  if (text && text !== last) {
    last = text
    w.postMessage({ type: 'partial', text })
  }
  if (final || rec.isEndpoint(stream)) {
    if (last) w.postMessage({ type: 'final', text: last })
    last = ''
    rec.reset(stream)
  }
}

type Msg = Init | { type: 'audio'; samples: Float32Array; end: number } | { type: 'end' }

w.onmessage = (e: MessageEvent) => {
  const m = e.data as Msg
  try {
    if (m.type === 'init') return init(m)
    if (!stream) return
    if (m.type === 'audio') {
      const t = performance.now()
      stream.acceptWaveform(16000, m.samples)
      step(false)
      w.postMessage({ type: 'done', end: m.end, ms: performance.now() - t })
    } else {
      // Mezzo secondo di silenzio per far uscire le ultime parole.
      stream.acceptWaveform(16000, new Float32Array(8000))
      step(true)
      w.postMessage({ type: 'ended' })
    }
  } catch (err) {
    fail(err)
  }
}
