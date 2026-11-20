// Worker (classico, senza import) della traduzione Bergamot di Firefox: cinese→inglese→italiano e inglese→italiano.
// Stesse impostazioni del worker di traduzione di Firefox (content/translations-engine.worker.js).

interface Aligned {
  getByteArrayView(): Uint8Array
}
interface Vec<T> {
  push_back(x: T): void
  delete(): void
}
interface Response {
  get(i: number): { getTranslatedText(): string }
  delete(): void
}
interface Service {
  translate(model: unknown, m: Vec<string>, o: unknown): Response
}
interface Bergamot {
  HEAPU8: Uint8Array
  AlignedMemory: new (size: number, align: number) => Aligned
  AlignedMemoryList: new () => Vec<Aligned>
  TranslationModel: new (src: string, trg: string, cfg: string, model: Aligned, lex: Aligned, vocabs: Vec<Aligned>, q: null) => unknown
  BlockingService: new (o: { cacheSize: number }) => Service
  VectorString: new () => Vec<string>
  VectorResponseOptions: new () => Vec<{ qualityScores: boolean; alignment: boolean; html: boolean }>
}
interface Scope {
  postMessage(m: unknown): void
  onmessage: ((e: MessageEvent) => void) | null
  importScripts(...urls: string[]): void
  loadBergamot(m: Record<string, unknown>): Bergamot
}
const w = self as unknown as Scope

interface PairBufs {
  model: ArrayBuffer
  lex: ArrayBuffer
  vocab: ArrayBuffer
}
interface Init {
  type: 'init'
  glue: string
  wasm: ArrayBuffer | null
  zhen: PairBufs | null
  enit: PairBufs | null
}

let b: Bergamot
let service: Service
const models: Record<string, unknown> = {}

const fail = (err: unknown) => w.postMessage({ type: 'error', msg: err instanceof Error ? err.message : String(err) })

const OPTIONS: Record<string, string> = {
  'beam-size': '1',
  normalize: '1.0',
  'word-penalty': '0',
  'max-length-break': '128',
  'mini-batch-words': '1024',
  workspace: '128',
  'max-length-factor': '2.0',
  'skip-cost': 'true',
  'cpu-threads': '0',
  quiet: 'true',
  'quiet-translation': 'true',
  'gemm-precision': 'int8shiftAlphaAll',
  alignment: 'soft',
}
const CONFIG = `\n${Object.entries(OPTIONS).map(([k, v]) => `            ${k}: ${v}\n`).join('')}            `

function mem(buf: ArrayBuffer, align: number): Aligned {
  const m = new b.AlignedMemory(buf.byteLength, align)
  m.getByteArrayView().set(new Uint8Array(buf))
  return m
}

function load(src: string, trg: string, p: PairBufs) {
  const vocabs = new b.AlignedMemoryList()
  vocabs.push_back(mem(p.vocab, 64))
  return new b.TranslationModel(src, trg, CONFIG, mem(p.model, 256), mem(p.lex, 64), vocabs, null)
}

function translate(model: unknown, text: string): string {
  const msgs = new b.VectorString()
  const opts = new b.VectorResponseOptions()
  msgs.push_back(text)
  opts.push_back({ qualityScores: false, alignment: false, html: false })
  const res = service.translate(model, msgs, opts)
  const out = res.get(0).getTranslatedText()
  msgs.delete()
  opts.delete()
  res.delete()
  return out
}

function init(m: Init) {
  const t0 = performance.now()
  w.importScripts(m.glue)
  b = w.loadBergamot({
    INITIAL_MEMORY: 41_943_040,
    wasmBinary: m.wasm,
    print: () => {},
    printErr: () => {},
    onAbort: (what: unknown) => fail(`motore interrotto: ${String(what)}`),
    onRuntimeInitialized: () => {
      // Come in Firefox: si aspetta un giro, perché `b` sia già assegnato.
      void Promise.resolve().then(() => {
        try {
          service = new b.BlockingService({ cacheSize: 0 })
          models.zhen = load('zh', 'en', m.zhen!)
          models.enit = load('en', 'it', m.enit!)
          // I modelli sono copiati nella memoria del motore: i buffer ricevuti si lasciano al garbage collector.
          m.zhen = null
          m.enit = null
          m.wasm = null
          ;(b as unknown as Record<string, unknown>).wasmBinary = null
          w.postMessage({ type: 'ready', ms: Math.round(performance.now() - t0), heapMB: Math.round(b.HEAPU8.length / 1048576) })
        } catch (err) {
          fail(err)
        }
      })
    },
  })
}

type Msg = Init | { type: 'translate'; id: number; text: string; from: 'zh' | 'en' }

w.onmessage = (e: MessageEvent) => {
  const m = e.data as Msg
  try {
    if (m.type === 'init') return init(m)
    let en = m.text
    let msEn = 0
    if (m.from === 'zh') {
      const t = performance.now()
      en = translate(models.zhen, m.text)
      msEn = performance.now() - t
    }
    const t = performance.now()
    const it = translate(models.enit, en)
    w.postMessage({ type: 'translated', id: m.id, en, it, msEn: Math.round(msEn), msIt: Math.round(performance.now() - t), heapMB: Math.round(b.HEAPU8.length / 1048576) })
  } catch (err) {
    fail(err)
  }
}
