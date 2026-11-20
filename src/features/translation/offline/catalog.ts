import type { ModelFile } from './models'

// Cosa serve per ascoltare e tradurre senza rete. Motori e modelli piccoli sono nell'app (public/offline/models/,
// compressi e divisi in pezzi da scripts/pack-model.mjs): si scaricano dallo stesso sito dell'app.
// Il CDN di Mozilla risponde 406 a Chrome, e Hugging Face dalla Cina senza VPN non risponde: per questo stanno qui.
// Solo il modello grande (troppo pesante per l'app) resta su Hugging Face.

const BASE = `${import.meta.env.BASE_URL}offline/models/`
const HF = (repo: string, file: string) => `https://huggingface.co/csukuangfj/${repo}/resolve/main/${file}`
/** File dell'app, compresso e a pezzi: `size` = byte compressi. */
const local = (dir: string, file: string, parts: number, size: number, name: string): ModelFile => ({ name, url: `${BASE}${dir}/${file}.gz`, parts, size })

/** Motore sherpa-onnx v1.13.7 (build ufficiale WebAssembly, un solo thread). */
export const SHERPA_ENGINE = {
  glue: local('engine', 'sherpa-onnx-wasm-main-asr.js', 1, 22_721, 'Motore ascolto (js)'),
  api: local('engine', 'sherpa-onnx-asr.js', 1, 6_617, 'Motore ascolto (api)'),
  wasm: local('engine', 'sherpa-onnx-wasm-main-asr.wasm', 1, 3_614_186, 'Motore ascolto (wasm)'),
}

/** Motore Bergamot di Firefox (v0.6.0, quello che Firefox scarica per tradurre sul dispositivo). */
export const BERGAMOT_ENGINE = {
  glue: local('engine', 'bergamot-translator.js', 1, 22_248, 'Motore traduzione (js)'),
  wasm: local('engine', 'bergamot-translator.wasm', 1, 1_880_441, 'Motore traduzione (wasm)'),
}

export type AsrKind = 'transducer' | 'ctc'

export interface AsrModel {
  id: string
  label: string
  /** Lingue che sa riconoscere. */
  langs: string
  kind: AsrKind
  /** true se si scarica da Hugging Face (in Cina serve la VPN). */
  external?: boolean
  /** File da scrivere nel file system del motore: nome interno → file da scaricare. */
  files: Record<string, ModelFile>
}

const T = ['encoder', 'decoder', 'joiner'] as const
const hfTransducer = (repo: string, label: string, langs: string, sizes: [number, number, number, number]): AsrModel => ({
  id: repo,
  label,
  langs,
  kind: 'transducer',
  external: true,
  files: {
    ...Object.fromEntries(T.map((p, i) => [`${p}.onnx`, { name: `${label}: ${p}`, url: HF(repo, `${p}-epoch-99-avg-1.int8.onnx`), size: sizes[i] }])),
    'tokens.txt': { name: `${label}: tokens`, url: HF(repo, 'tokens.txt'), size: sizes[3] },
  },
})

/** Modelli di riconoscimento in streaming (int8). Il misto cinese+inglese piccolo esiste solo in un altro formato. */
export const ASR_MODELS: AsrModel[] = [
  {
    id: 'zh-small-2025',
    label: 'Solo cinese (piccolo, 2025)',
    langs: 'zh',
    kind: 'ctc',
    files: {
      'model.onnx': local('zh-small', 'model.int8.onnx', 3, 19_787_023, 'Solo cinese: modello'),
      'tokens.txt': local('zh-small', 'tokens.txt', 1, 5_493, 'Solo cinese: tokens'),
    },
  },
  {
    id: 'en-20m-2023',
    label: 'Solo inglese (piccolo)',
    langs: 'en',
    kind: 'transducer',
    files: {
      'encoder.onnx': local('en-20m', 'encoder-epoch-99-avg-1.int8.onnx', 5, 37_646_739, 'Solo inglese: encoder'),
      'decoder.onnx': local('en-20m', 'decoder-epoch-99-avg-1.int8.onnx', 1, 370_449, 'Solo inglese: decoder'),
      'joiner.onnx': local('en-20m', 'joiner-epoch-99-avg-1.int8.onnx', 1, 198_756, 'Solo inglese: joiner'),
      'tokens.txt': local('en-20m', 'tokens.txt', 1, 2_501, 'Solo inglese: tokens'),
    },
  },
  hfTransducer('sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20', 'Cinese + inglese (grande)', 'zh+en', [181_895_032, 13_091_040, 3_228_404, 56_317]),
]

export interface MtPair {
  model: ModelFile
  lex: ModelFile
  vocab: ModelFile
}

/** Modelli Mozilla "base-memory" v2.1 (quelli che Firefox usa su Android), identici ai suoi, licenza MPL-2.0. */
export const MT_MODELS: { zhen: MtPair; enit: MtPair } = {
  zhen: {
    model: local('mt', 'model.zhen.intgemm.alphas.bin', 4, 32_137_602, 'Traduzione cinese→inglese: modello'),
    lex: local('mt', 'lex.50.50.zhen.s2t.bin', 1, 4_613_529, 'Traduzione cinese→inglese: lessico'),
    vocab: local('mt', 'vocab.zhen.spm', 1, 755_638, 'Traduzione cinese→inglese: vocabolario'),
  },
  enit: {
    model: local('mt', 'model.enit.intgemm.alphas.bin', 3, 23_546_150, 'Traduzione inglese→italiano: modello'),
    lex: local('mt', 'lex.50.50.enit.s2t.bin', 1, 2_131_749, 'Traduzione inglese→italiano: lessico'),
    vocab: local('mt', 'vocab.enit.spm', 1, 425_495, 'Traduzione inglese→italiano: vocabolario'),
  },
}

/** Tutti i file per una prova con il modello di ascolto scelto. */
export const filesFor = (asr: AsrModel): ModelFile[] => [
  ...Object.values(SHERPA_ENGINE),
  ...Object.values(BERGAMOT_ENGINE),
  ...Object.values(MT_MODELS.zhen),
  ...Object.values(MT_MODELS.enit),
  ...Object.values(asr.files),
]
