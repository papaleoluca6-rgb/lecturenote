# Motori e modelli offline (traduttore senza rete)

Usati solo dalla prova «Traduttore senza rete» (`src/features/translation/offline/`). Ogni file è compresso con gzip
e diviso in pezzi da 8 MB (`<file>.gz.part00`, …) da `scripts/pack-model.mjs`: l'app scarica i pezzi uno alla volta,
riprova quelli che non arrivano e riparte da dove si era fermata. Contenuto identico agli originali.

- `models/engine/`:
  - sherpa-onnx v1.13.7, build WebAssembly SIMD ufficiale (js + wasm, senza il pacchetto `.data`), dalle release di
    https://github.com/k2-fsa/sherpa-onnx — licenza Apache-2.0.
  - Bergamot di Firefox v0.6.0: wasm dalla raccolta Remote Settings `translations-wasm` di Mozilla, js da
    `toolkit/components/translations/bergamot-translator/` del codice di Firefox — licenza MPL-2.0.
- `models/mt/`: modelli Firefox Translations «base-memory» v2.1 (zh→en, en→it), dalla raccolta Remote Settings
  `translations-models` (il CDN di Mozilla risponde 406 a Chrome) — licenza MPL-2.0.
- `models/zh-small/`: `sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01` (Hugging Face, csukuangfj).
- `models/en-20m/`: `sherpa-onnx-streaming-zipformer-en-20M-2023-02-17` (Hugging Face, csukuangfj).

Il modello cinese+inglese grande (~200 MB) non è qui: si scarica da Hugging Face (dalla Cina serve la VPN).
