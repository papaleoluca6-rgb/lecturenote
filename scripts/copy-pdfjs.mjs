// Copia in public/pdfjs i file che pdf.js scarica a runtime (mappe dei caratteri CJK, font standard,
// decoder wasm). Servono da public per funzionare offline e vengono messi in cache dal service worker.
import { cpSync, existsSync, rmSync } from 'node:fs'

const src = 'node_modules/pdfjs-dist'
const dst = 'public/pdfjs'
if (!existsSync(src)) process.exit(0)
rmSync(dst, { recursive: true, force: true })
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(`${src}/${dir}`, `${dst}/${dir}`, {
    recursive: true,
    filter: (p) => !/quickjs|LICENSE/.test(p.split(/[\/]/).pop() ?? ''),
  })
}
console.log('pdf.js: risorse copiate in', dst)
