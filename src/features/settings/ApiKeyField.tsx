import { useState } from 'react'
import { db } from '../../db/schema'
import { DEFAULTS, getSetting, setSetting, useSetting } from '../../db/settings'

export function ApiKeyField() {
  const saved = useSetting('apiKey.gemini')
  const [edit, setEdit] = useState<string | null>(null)
  const draft = edit ?? saved
  const [shown, setShown] = useState(false)

  const save = async () => {
    await setSetting('apiKey.gemini', draft.trim())
    setEdit(null)
  }
  const clear = async () => {
    if (!confirm('Cancellare la chiave Gemini?')) return
    await db.transaction('rw', db.settings, async () => {
      await setSetting('apiKey.gemini', '')
      // Senza chiave le opzioni Gemini non sono valide: se erano scelte, torna ai default gratuiti.
      if ((await getSetting('stt.provider')) === 'gemini-chunks') await setSetting('stt.provider', DEFAULTS['stt.provider'])
      if ((await getSetting('translator.provider')) === 'gemini') await setSetting('translator.provider', DEFAULTS['translator.provider'])
    })
    setEdit(null)
  }

  return (
    <section className="set-sec">
      <h2>Chiave AI facoltativa</h2>
      <p className="lib-muted">
        Serve solo per le opzioni Gemini: è facoltativa, gratuita nel piano free di Google e resta solo su questo tablet.
        L&apos;app funziona del tutto anche senza.
      </p>
      <div className="lib-row">
        <input className="lib-input" type={shown ? 'text' : 'password'} placeholder="Chiave Gemini" autoComplete="off"
          value={draft} onChange={(e) => setEdit(e.target.value)} />
        <button className="lib-btn" type="button" onClick={() => setShown(!shown)}>{shown ? 'Nascondi' : 'Mostra'}</button>
      </div>
      <div className="lib-actions set-actions">
        <button className="lib-btn primary" onClick={save} disabled={draft.trim() === saved}>Salva</button>
        <button className="lib-btn danger" onClick={clear} disabled={!saved}>Cancella</button>
      </div>
    </section>
  )
}
