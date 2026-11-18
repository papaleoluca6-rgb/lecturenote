import { useState } from 'react'
import { Icon } from '../../lib/Icon'
import { downloadBackup, exportBackup, importBackup } from './backup'
import { importLegacy } from './legacy'

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
    void run(async () => {
      const { counts, unknown } = await importBackup(file, setMsg)
      const list = Object.entries(counts).map(([t, n]) => `${t}: ${n}`).join(', ')
      return `Importazione completata. ${list}.` + (unknown.length ? ` Ignorate tabelle sconosciute: ${unknown.join(', ')}.` : '')
    })
  }

  return (
    <section className="ui-sec">
      <h2>Backup</h2>
      <p className="ui-muted">I dati restano sul tablet: esporta un file per tenerne una copia (le chiavi API non sono incluse).</p>
      <div className="ui-row">
        <button className="ui-btn" disabled={busy} onClick={() => void doExport()}><Icon name="download" /> Esporta tutto</button>
        <label className={`ui-btn${busy ? ' disabled' : ''}`}>
          <Icon name="upload" /> Importa backup…
          <input type="file" accept=".lnbak" hidden disabled={busy} onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) doImport(f)
          }} />
        </label>
        <label className={`ui-btn${busy ? ' disabled' : ''}`}>
          <Icon name="folder" /> Lezioni della vecchia app (.json)…
          <input type="file" accept=".json,application/json" multiple hidden disabled={busy} onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            if (files.length) void run(() => importLegacy(files, setMsg))
          }} />
        </label>
      </div>
      {msg && <p role="status">{msg}</p>}
    </section>
  )
}
