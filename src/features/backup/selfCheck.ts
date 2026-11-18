import { decode, encode } from './format'

/** Solo sviluppo: da console del browser. Costruisce un backup finto, lo rilegge e confronta. */
export async function selfCheckBackup() {
  const mk = (s: string, type: string) => new Blob([s], { type })
  const tables = {
    audio: [{ id: 'a', blob: mk('abcdef', 'audio/webm'), n: 1 }, { id: 'b', blob: mk('', 'x/y') }],
    notes: [{ id: 'n', text: 'ciao 你好 è', photo: mk('XYZ', 'image/png'), nested: [{ deep: mk('Q', 'q/q') }] }],
    empty: [],
  }
  const file = new File([encode(tables, 1)], 'x.lnbak')
  const { meta, tables: out } = await decode(file)
  const eq = (a: unknown, b: unknown) => { if (a !== b) throw new Error(`selfCheckBackup: ${String(a)} !== ${String(b)}`) }
  const blobEq = async (a: unknown, b: unknown) => {
    const [x, y] = [a as Blob, b as Blob]
    eq(x.type, y.type); eq(await x.text(), await y.text())
  }
  eq(meta.dbVersion, 1)
  const o = out as typeof tables
  eq(o.audio.length, 2); eq(o.notes.length, 1); eq(o.empty.length, 0)
  await blobEq(o.audio[0].blob, tables.audio[0].blob)
  await blobEq(o.audio[1].blob, tables.audio[1].blob)
  await blobEq(o.notes[0].photo, tables.notes[0].photo)
  await blobEq(o.notes[0].nested[0].deep, tables.notes[0].nested[0].deep)
  eq(o.notes[0].text, tables.notes[0].text); eq(o.audio[0].n, 1)
  let rejected = false
  try { await decode(new Blob(['garbage'])) } catch { rejected = true }
  eq(rejected, true)
  const d = new Date(5)
  const { tables: t2 } = await decode(new File([encode({ x: [{ d }] }, 1)], 'y.lnbak'))
  eq(typeof (t2.x[0] as { d: unknown }).d, 'string') // Date -> JSON string, non mangled to {}
  rejected = false
  try { await decode(file.slice(0, file.size - 1)) } catch { rejected = true } // file troncato
  eq(rejected, true)
  return 'selfCheckBackup OK'
}
