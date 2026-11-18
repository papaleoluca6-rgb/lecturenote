import { db } from '../../db/schema'
import { decode, encode, type Tables } from './format'

/** Le chiavi API non escono dal tablet. */
const exportable = (table: string, rows: unknown[]) =>
  table === 'settings' ? rows.filter((r) => !String((r as { key: string }).key).startsWith('apiKey.')) : rows

export async function exportBackup(): Promise<Blob> {
  const tables: Tables = {}
  for (const t of db.tables) tables[t.name] = exportable(t.name, await t.toArray())
  return encode(tables, db.verno)
}

export function downloadBackup(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lecturenote-backup-${new Date().toISOString().slice(0, 10)}.lnbak`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export interface ImportResult { counts: Record<string, number>; unknown: string[] }

/** Unisce il backup al database: stesso id = sovrascritto, il resto resta. */
export async function importBackup(file: File, onProgress: (msg: string) => void): Promise<ImportResult> {
  const { meta, tables } = await decode(file)
  if (meta.dbVersion > db.verno) throw new Error("Il backup viene da una versione più recente dell'app: aggiornala e riprova.")
  const known = db.tables.filter((t) => t.name in tables)
  const unknown = Object.keys(tables).filter((n) => !db.tables.some((t) => t.name === n))
  const counts: Record<string, number> = {}
  try {
    await db.transaction('rw', known, async () => {
      let i = 0
      for (const t of known) {
        onProgress(`Importo ${t.name}… ${++i}/${known.length} tabelle`)
        await t.bulkPut(tables[t.name])
        counts[t.name] = tables[t.name].length
      }
    })
  } catch (e) {
    throw new Error(`Importazione non riuscita: ${e instanceof Error ? e.message : String(e)}`)
  }
  return { counts, unknown }
}
