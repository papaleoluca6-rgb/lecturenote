import { useState } from 'react'
import { db } from '../../db/schema'
import { DEFAULTS, getSetting, setSetting, useSetting } from '../../db/settings'

export function ApiKeyField() {
  const saved = useSetting('apiKey.gemini')
  const [edit, setEdit] = useState<string | null>(null)
  const draft = edit ?? saved
  const [shown, setShown] = useState(false)

  const [error, setError] = useState('')

  const attempt = async (job: () => Promise<void>) => {
    setError('')
    try { await job() } catch { setError('Impossibile salvare: riprova.') }
  }
  // La bozza resta quella appena salvata finché il database non risponde: niente sfarfallio del vecchio valore.
  const save = () => attempt(async () => {
    const v = draft.trim()
    await setSetting('apiKey.gemini', v)
    setEdit(v)
  })
  const clear = async () => {
    if (!confirm('Cancellare la chiave Gemini?')) return
    await attempt(async () => {
      await db.transaction('rw', db.settings, async () => {
        await setSetting('apiKey.gemini', '')
        // Senza chiave le opzioni Gemini non sono valide: se erano scelte, torna ai default gratuiti.
        if ((await getSetting('stt.provider')) === 'gemini-chunks') await setSetting('stt.provider', DEFAULTS['stt.provider'])
        if ((await getSetting('translator.provider')) === 'gemini') await setSetting('translator.provider', DEFAULTS['translator.provider'])
      })
      setEdit('')
    })
  }

  return (
    <section className="ui-sec">
      <h2>Chiave AI facoltativa</h2>
      <p className="ui-muted">
        Serve solo per le opzioni Gemini: è facoltativa, gratuita nel piano free di Google e resta solo su questo tablet.
        L&apos;app funziona del tutto anche senza.
      </p>
      <div className="ui-row">
        <input className="ui-input" type={shown ? 'text' : 'password'} placeholder="Chiave Gemini" autoComplete="new-password"
          value={draft} onChange={(e) => setEdit(e.target.value)} />
        <button className="ui-btn" type="button" onClick={() => setShown(!shown)}>{shown ? 'Nascondi' : 'Mostra'}</button>
      </div>
      <div className="ui-actions set-actions">
        <button className="ui-btn primary" onClick={save} disabled={draft.trim() === saved}>Salva</button>
        <button className="ui-btn danger" onClick={clear} disabled={!saved}>Cancella</button>
      </div>
      {error && <p className="ui-muted" role="alert">{error}</p>}
    </section>
  )
}
