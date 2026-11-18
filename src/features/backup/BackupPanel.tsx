import { useState } from 'react'
import { downloadBackup, exportBackup, importBackup } from './backup'

const mb = (n: number) => (n / 1048576).toFixed(1).replace('.', ',') + ' MB'

export function BackupPanel() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const run = async (job: () => Promise<string>) => {
    setBusy(true)
    try { setMsg(await job()) } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }

  const doExport = () => run(async () => {
    setMsg('Creo il backup…')
    const blob = await exportBackup()
    downloadBackup(blob)
    return `Backup creato (${mb(blob.size)}).`
  })

  const doImport = (file: File) => {
    if (!confirm("Importare il backup? Gli elementi con lo stesso id verranno sovrascritti; tutto il resto resta com'è e nulla viene eliminato.")) return
    run(async () => {
      const { counts, unknown } = await importBackup(file, setMsg)
      const list = Object.entries(counts).map(([t, n]) => `${t}: ${n}`).join(', ')
      return `Importazione completata. ${list}.` + (unknown.length ? ` Ignorate tabelle sconosciute: ${unknown.join(', ')}.` : '')
    })
  }

  return (
    <section className="set-sec">
      <h2>Backup</h2>
      <p>I dati restano sul tablet: esporta un file per tenerne una copia (le chiavi API non sono incluse).</p>
      <div className="set-choices">
        <button className="lib-btn" disabled={busy} onClick={doExport}>Esporta tutto</button>
        <label className="lib-btn">
          Importa backup…
          <input type="file" accept=".lnbak" hidden disabled={busy} onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) doImport(f)
          }} />
        </label>
      </div>
      {msg && <p role="status">{msg}</p>}
    </section>
  )
}
