import { useState } from 'react'
import { db } from '../../db/schema'
import { DEFAULTS, getSetting, keyOf, setSetting, useSetting, type SettingKey } from '../../db/settings'

interface Props {
  settingKey: Extract<SettingKey, `apiKey.${string}`>
  title: string
  help: string
}

export function ApiKeyField({ settingKey, title, help }: Props) {
  const saved = useSetting(settingKey)
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
    await setSetting(settingKey, v)
    setEdit(v)
  })
  const clear = async () => {
    if (!confirm(`Cancellare la chiave ${title}?`)) return
    await attempt(async () => {
      await db.transaction('rw', db.settings, async () => {
        await setSetting(settingKey, '')
        // Senza chiave le scelte che la usano non sono valide: tornano ai default gratuiti.
        for (const k of ['stt.provider', 'translator.provider'] as const) {
          if (keyOf(await getSetting(k)) === settingKey) await setSetting(k, DEFAULTS[k])
        }
      })
      setEdit('')
    })
  }

  return (
    <section className="ui-sec">
      <h2>Chiave {title}</h2>
      <p className="ui-muted">{help}</p>
      <div className="ui-row">
        <input className="ui-input" type={shown ? 'text' : 'password'} placeholder={`Chiave ${title}`} autoComplete="new-password"
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
