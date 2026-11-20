// Prepara un file di modello per public/offline/models: compresso gzip e diviso in pezzi da 8 MB
// (<file>.gz.part00, .part01, …). L'app scarica i pezzi uno alla volta, riprova quelli che non arrivano
// e riparte da dove si era fermata (src/features/translation/offline/models.ts).
//
// Uso: node scripts/pack-model.mjs <cartella-destinazione> <file> [<file> …]
// Stampa per ogni file: nome, numero di pezzi e byte compressi (da copiare in catalog.ts).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { gzipSync } from 'node:zlib'

const PART = 8 * 1024 * 1024
const [dest, ...files] = process.argv.slice(2)
if (!dest || !files.length) {
  console.error('Uso: node scripts/pack-model.mjs <cartella-destinazione> <file> [<file> …]')
  process.exit(1)
}
mkdirSync(dest, { recursive: true })
for (const f of files) {
  const gz = gzipSync(readFileSync(f), { level: 9 })
  const name = basename(f)
  const parts = Math.ceil(gz.length / PART)
  for (let i = 0; i < parts; i++) writeFileSync(join(dest, `${name}.gz.part${String(i).padStart(2, '0')}`), gz.subarray(i * PART, (i + 1) * PART))
  console.log(JSON.stringify({ name, parts, size: gz.length }))
}
