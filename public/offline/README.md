# Motori offline (traduttore senza rete)

File copiati senza modifiche, caricati solo dalla prova «Traduttore senza rete» (`src/features/translation/offline/`).

- `sherpa/`: sherpa-onnx v1.13.7, build WebAssembly SIMD ufficiale
  (`sherpa-onnx-wasm-simd-v1.13.7-zh-en-asr-zipformer.tar.bz2` dalle release di https://github.com/k2-fsa/sherpa-onnx).
  Solo motore (js + wasm), senza il pacchetto `.data` del modello: i modelli si scaricano da Hugging Face (csukuangfj).
  Licenza Apache-2.0.
- `bergamot/`: motore di traduzione Bergamot di Firefox (v0.6.0): wasm dalla raccolta Remote Settings
  `translations-wasm` di Mozilla, js da `toolkit/components/translations/bergamot-translator/` del codice di Firefox.
  Licenza MPL-2.0.
- `bergamot/models/`: modelli Firefox Translations «base-memory» v2.1 (zh→en ed en→it), file identici a quelli della
  raccolta Remote Settings `translations-models` di Mozilla, compressi con gzip. Sono qui perché il CDN di Mozilla
  risponde 406 a Chrome. Licenza MPL-2.0 (https://github.com/mozilla/firefox-translations-models).
