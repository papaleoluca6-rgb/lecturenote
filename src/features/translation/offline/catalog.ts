import type { ModelFile } from './models'

// Cosa serve per ascoltare e tradurre senza rete. I motori (codice WebAssembly) stanno nell'app (public/offline/);
// i modelli di ascolto si scaricano da Hugging Face (che li permette da un'altra pagina web, CORS), quelli di traduzione
// sono nell'app. In Cina probabilmente serve la VPN solo per questo primo scaricamento.

const BASE = `${import.meta.env.BASE_URL}offline/`
const HF = (repo: string, file: string) => `https://huggingface.co/csukuangfj/${repo}/resolve/main/${file}`
/**
 * Modelli di traduzione dentro l'app (compressi gzip): il CDN di Mozilla risponde 406 a Chrome (accetta solo Firefox)
 * e un sito web non può cambiare lo user agent. File identici a quelli di Firefox, licenza MPL-2.0.
 */
const MT = (file: string, size: number): Pick<ModelFile, 'url' | 'size' | 'gz'> => ({ url: `${BASE}bergamot/models/${file}.gz`, size, gz: true })

/** Motore sherpa-onnx v1.13.7 (build ufficiale WebAssembly, un solo thread). */
export const SHERPA_ENGINE = {
  glue: { name: 'Motore ascolto (js)', url: `${BASE}sherpa/sherpa-onnx-wasm-main-asr.js`, size: 90_000 },
  api: { name: 'Motore ascolto (api)', url: `${BASE}sherpa/sherpa-onnx-asr.js`, size: 55_000 },
  wasm: { name: 'Motore ascolto (wasm)', url: `${BASE}sherpa/sherpa-onnx-wasm-main-asr.wasm`, size: 13_000_000 },
} satisfies Record<string, ModelFile>

/** Motore Bergamot di Firefox (v0.6.0, quello che Firefox scarica per tradurre sul dispositivo). */
export const BERGAMOT_ENGINE = {
  glue: { name: 'Motore traduzione (js)', url: `${BASE}bergamot/bergamot-translator.js`, size: 100_000 },
  wasm: { name: 'Motore traduzione (wasm)', url: `${BASE}bergamot/bergamot-translator.wasm`, size: 4_960_506 },
} satisfies Record<string, ModelFile>

export type AsrKind = 'transducer' | 'ctc'

export interface AsrModel {
  id: string
  label: string
  /** Lingue che sa riconoscere. */
  langs: string
  kind: AsrKind
  /** File da scrivere nel file system del motore: nome interno → file da scaricare. */
  files: Record<string, ModelFile>
}

const transducer = (repo: string, label: string, langs: string, sizes: [number, number, number, number]): AsrModel => ({
  id: repo,
  label,
  langs,
  kind: 'transducer',
  files: {
    'encoder.onnx': { name: `${label}: encoder`, url: HF(repo, 'encoder-epoch-99-avg-1.int8.onnx'), size: sizes[0] },
    'decoder.onnx': { name: `${label}: decoder`, url: HF(repo, 'decoder-epoch-99-avg-1.int8.onnx'), size: sizes[1] },
    'joiner.onnx': { name: `${label}: joiner`, url: HF(repo, 'joiner-epoch-99-avg-1.int8.onnx'), size: sizes[2] },
    'tokens.txt': { name: `${label}: tokens`, url: HF(repo, 'tokens.txt'), size: sizes[3] },
  },
})

/** Modelli di riconoscimento in streaming (int8). Il misto cinese+inglese piccolo esiste solo in un altro formato. */
export const ASR_MODELS: AsrModel[] = [
  transducer('sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20', 'Cinese + inglese (grande)', 'zh+en', [181_895_032, 13_091_040, 3_228_404, 56_317]),
  {
    id: 'sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01',
    label: 'Solo cinese (piccolo, 2025)',
    langs: 'zh',
    kind: 'ctc',
    files: {
      'model.onnx': { name: 'Solo cinese: modello', url: HF('sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01', 'model.int8.onnx'), size: 26_342_340 },
      'tokens.txt': { name: 'Solo cinese: tokens', url: HF('sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01', 'tokens.txt'), size: 13_366 },
    },
  },
  transducer('sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23', 'Solo cinese (minimo, 2023)', 'zh', [21_621_684, 1_888_682, 1_795_562, 48_697]),
  transducer('sherpa-onnx-streaming-zipformer-en-20M-2023-02-17', 'Solo inglese (piccolo)', 'en', [42_845_182, 539_499, 259_572, 5_048]),
]

export interface MtPair {
  model: ModelFile
  lex: ModelFile
  vocab: ModelFile
}

/** Modelli Mozilla "base-memory" v2.1 (quelli che Firefox usa su Android), file non compressi. */
export const MT_MODELS: { zhen: MtPair; enit: MtPair } = {
  zhen: {
    model: { name: 'Traduzione cinese→inglese: modello', ...MT('model.zhen.intgemm.alphas.bin', 32_689_083) },
    lex: { name: 'Traduzione cinese→inglese: lessico', ...MT('lex.50.50.zhen.s2t.bin', 4_714_651) },
    vocab: { name: 'Traduzione cinese→inglese: vocabolario', ...MT('vocab.zhen.spm', 732_356) },
  },
  enit: {
    model: { name: 'Traduzione inglese→italiano: modello', ...MT('model.enit.intgemm.alphas.bin', 23_876_973) },
    lex: { name: 'Traduzione inglese→italiano: lessico', ...MT('lex.50.50.enit.s2t.bin', 2_156_967) },
    vocab: { name: 'Traduzione inglese→italiano: vocabolario', ...MT('vocab.enit.spm', 408_627) },
  },
}

/** Tutti i file per una prova con il modello di ascolto scelto. */
export const filesFor = (asr: AsrModel): ModelFile[] => [
  ...Object.values(SHERPA_ENGINE),
  ...Object.values(BERGAMOT_ENGINE),
  ...Object.values(asr.files),
  ...Object.values(MT_MODELS.zhen),
  ...Object.values(MT_MODELS.enit),
]
