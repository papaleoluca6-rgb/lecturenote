import { db } from '../../db/schema'
import { decode, encode, type Tables } from './format'

/** Le chiavi API non escono dal tablet. */
const isSecret = (r: unknown) => String((r as { key?: unknown }).key).startsWith('apiKey.')
const withoutSecrets = (table: string, rows: unknown[]) => (table === 'settings' ? rows.filter((r) => !isSecret(r)) : rows)
/** Quante righe alla volta si scrivono (e si aggiorna l'avanzamento) nelle tabelle grandi come l'audio. */
const CHUNK = 20

export async function exportBackup(): Promise<Blob> {
  const tables: Tables = {}
  // Una sola transazione di lettura: le tabelle sono tutte dello stesso istante.
  await db.transaction('r', db.tables, async () => {
    for (const t of db.tables) tables[t.name] = withoutSecrets(t.name, await t.toArray())
  })
  return encode(tables, db.verno)
}

const localDate = () => {
  const d = new Date()
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n, i) => String(n).padStart(i ? 2 : 4, '0')).join('-')
}

export function downloadBackup(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lecturenote-backup-${localDate()}.lnbak`
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
  if (!known.length) throw new Error('Il backup non contiene dati di questa app.')
  const counts: Record<string, number> = {}
  try {
    await db.transaction('rw', known, async () => {
      let i = 0
      for (const t of known) {
        const rows = withoutSecrets(t.name, tables[t.name])
        i++
        for (let at = 0; at < rows.length || at === 0; at += CHUNK) {
          onProgress(`Importo ${t.name}… ${Math.min(at + CHUNK, rows.length)}/${rows.length} righe (tabella ${i}/${known.length})`)
          await t.bulkPut(rows.slice(at, at + CHUNK))
        }
        counts[t.name] = rows.length
      }
    })
  } catch (e) {
    throw new Error(`Importazione non riuscita: ${e instanceof Error ? e.message : String(e)}`)
  }
  return { counts, unknown }
}
