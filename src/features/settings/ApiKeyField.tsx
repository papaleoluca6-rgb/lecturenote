import { useState } from 'react'
import { setSetting, useSetting } from '../../db/settings'

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
    await setSetting('apiKey.gemini', '')
    setEdit(null)
    // Senza chiave le opzioni Gemini non sono più valide: torna ai default gratuiti.
    await setSetting('stt.provider', 'webspeech-device')
    await setSetting('translator.provider', 'chrome')
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
