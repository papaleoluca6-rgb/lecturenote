import { useState } from 'react'
import { PROVIDERS, saveConfig, type ProbeConfig, type ProviderId } from './config'
import { CONN_TESTS, runConnTest, type ConnTestId } from './connTests'
import type { ConnResult } from './log'

interface Props {
  cfg: ProbeConfig
  vpn: boolean
  onCfg: (c: ProbeConfig) => void
  onResult: (r: ConnResult) => void
}

export function KeysPanel({ cfg, vpn, onCfg, onResult }: Props) {
  const [saved, setSaved] = useState(true)
  const [busy, setBusy] = useState<ConnTestId | null>(null)
  const [progress, setProgress] = useState('')
  const [last, setLast] = useState<Partial<Record<ConnTestId, ConnResult>>>({})

  const edit = (c: ProbeConfig) => {
    onCfg(c)
    setSaved(false)
  }
  const setKey = (id: ProviderId, v: string) => edit({ ...cfg, keys: { ...cfg.keys, [id]: v } })
  const save = async () => {
    await saveConfig(cfg)
    setSaved(true)
  }
  const test = async (id: ConnTestId, label: string) => {
    setBusy(id)
    setProgress('')
    const r = await runConnTest(id, cfg, setProgress)
    const res: ConnResult = { at: Date.now(), vpn, target: label, ...r }
    setLast((l) => ({ ...l, [id]: res }))
    onResult(res)
    setBusy(null)
  }

  return (
    <section className="pr-card">
      <h2>1 · Test dei servizi</h2>
      <p className="pr-muted">«Chrome offline» e «sul dispositivo» sono gratuiti e non usano AI esterne: la prima volta scaricano il modello, premi di nuovo per misurare i ms veri. Web Speech normale è gratuito ma passa da Google (in Cina serve la VPN).</p>
      <ul className="pr-tests">
        {CONN_TESTS.map((t) => {
          const r = last[t.id]
          return (
            <li key={t.id} className="pr-test">
              <button className="ui-btn" disabled={busy !== null} onClick={() => void test(t.id, t.label)}>
                {busy === t.id ? progress || 'Prova in corso…' : `Testa ${t.label}`}
              </button>
              {r && (
                <span className={`pr-res ${r.ok === true ? 'ok' : r.ok === false ? 'ko' : 'warn'}`}>
                  {r.ok === true ? 'OK' : r.ok === false ? 'KO' : 'Incerto'} · {r.ms} ms · {r.detail}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <details className="pr-field">
        <summary>Facoltativo: aggiungi una chiave AI (Gemini, Qwen, DeepSeek, Kimi) per confrontare</summary>
        <p className="pr-muted">Non serve per il funzionamento normale. La chiave resta sul tablet.</p>
        <div className="pr-grid">
          {PROVIDERS.map((p) => (
            <label key={p.id} className="pr-field">
              <span>Chiave {p.label}</span>
              <input className="pr-input" type="password" autoComplete="new-password" value={cfg.keys[p.id]} onChange={(e) => setKey(p.id, e.target.value)} />
            </label>
          ))}
          <label className="pr-field">
            <span>Modello Gemini</span>
            <input className="pr-input" value={cfg.geminiModel} onChange={(e) => edit({ ...cfg, geminiModel: e.target.value })} />
          </label>
        </div>
        <button className="ui-btn primary" onClick={() => void save()} disabled={saved}>{saved ? 'Salvato' : 'Salva'}</button>
      </details>
    </section>
  )
}
