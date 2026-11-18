// Formato .lnbak: riga 1 magic, riga 2 lunghezza JSON in byte, JSON, poi i Blob concatenati.
export const MAGIC = 'LECTURENOTE-BACKUP 1\n'
export const VERSION = 1

export type Tables = Record<string, unknown[]>
export interface Meta { version: number; createdAt: number; dbVersion: number }

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !(v instanceof Blob)

/** Copia di `v` con ogni Blob sostituito da un riferimento; i Blob vanno in `parts`. */
function strip(v: unknown, parts: Blob[], pos: { n: number }): unknown {
  if (v instanceof Blob) {
    const ref = { __blob: { offset: pos.n, size: v.size, type: v.type } }
    parts.push(v)
    pos.n += v.size
    return ref
  }
  if (Array.isArray(v)) return v.map((x) => strip(x, parts, pos))
  if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, strip(x, parts, pos)]))
  return v
}

/** Copia di `v` con i riferimenti trasformati in Blob (fette del file, non copiate in memoria). */
function revive(v: unknown, file: Blob, base: number): unknown {
  if (Array.isArray(v)) return v.map((x) => revive(x, file, base))
  if (!isPlain(v)) return v
  const b = v.__blob as { offset: number; size: number; type: string } | undefined
  if (b && Object.keys(v).length === 1) return file.slice(base + b.offset, base + b.offset + b.size, b.type)
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x, file, base)]))
}

export function encode(tables: Tables, dbVersion: number): Blob {
  const parts: Blob[] = []
  const stripped = strip(tables, parts, { n: 0 })
  const json = new TextEncoder().encode(JSON.stringify({ version: VERSION, createdAt: Date.now(), dbVersion, tables: stripped }))
  return new Blob([MAGIC, `${json.length}\n`, json, ...parts], { type: 'application/octet-stream' })
}

export async function decode(file: Blob): Promise<{ meta: Meta; tables: Tables }> {
  const bad = () => new Error('Il file non è un backup di LectureNote valido.')
  const head = await file.slice(0, 64).text()
  if (!head.startsWith(MAGIC)) throw bad()
  const m = /^(\d{1,12})\n/.exec(head.slice(MAGIC.length))
  if (!m) throw bad()
  const jsonLen = Number(m[1])
  const start = MAGIC.length + m[0].length
  if (start + jsonLen > file.size) throw bad()
  let data: { version?: number; createdAt: number; dbVersion: number; tables?: Tables }
  try { data = JSON.parse(await file.slice(start, start + jsonLen).text()) } catch { throw bad() }
  if (data.version !== VERSION) throw new Error("Versione del backup non supportata: aggiorna l'app e riprova.")
  if (!isPlain(data.tables)) throw bad()
  const tables = revive(data.tables, file, start + jsonLen) as Tables
  return { meta: { version: VERSION, createdAt: data.createdAt, dbVersion: data.dbVersion }, tables }
}
