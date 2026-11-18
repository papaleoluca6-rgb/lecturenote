import { useEffect, useState } from 'react'
import { DEFAULT_CONFIG, loadConfig, type ProbeConfig } from './config'
import { EMPTY_LOG, loadLog, saveLog, type ProbeLog } from './log'
import { KeysPanel } from './KeysPanel'
import { LivePanel } from './LivePanel'
import { ResultsPanel } from './ResultsPanel'
import { webSpeechAvailable } from './webSpeech'
import './probe.css'

/** Prova tecnica del traduttore (roadmap 3): da usare sul tablet reale, con e senza VPN. */
export function ProbeScreen({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg] = useState<ProbeConfig>(DEFAULT_CONFIG)
  const [log, setLog] = useState<ProbeLog | null>(null)
  const [vpn, setVpn] = useState(false)

  useEffect(() => {
    void loadConfig().then(setCfg)
    void loadLog().then(setLog)
  }, [])
  useEffect(() => {
    if (log) void saveLog(log)
  }, [log])

  const update = (f: (l: ProbeLog) => ProbeLog) => setLog((l) => f(l ?? EMPTY_LOG))

  return (
    <main className="pr">
      <header className="pr-top">
        <button className="pr-btn" onClick={onClose}>← Libreria</button>
        <h1>Prova traduttore</h1>
      </header>
      <section className="pr-card">
        <p>Fai ogni prova due volte: <b>senza VPN</b> e <b>con VPN</b>. Indica qui come sei collegato adesso: viene scritto in ogni risultato.</p>
        <div className="pr-row" role="radiogroup" aria-label="VPN">
          <button className={`pr-btn ${!vpn ? 'on' : ''}`} aria-pressed={!vpn} onClick={() => setVpn(false)}>Senza VPN</button>
          <button className={`pr-btn ${vpn ? 'on' : ''}`} aria-pressed={vpn} onClick={() => setVpn(true)}>Con VPN</button>
        </div>
        {!webSpeechAvailable() && <p className="pr-res ko">Questo browser non ha Web Speech API: usa Chrome.</p>}
      </section>
      <KeysPanel cfg={cfg} vpn={vpn} onCfg={setCfg} onResult={(r) => update((l) => ({ ...l, conn: [...l.conn, r] }))} />
      <LivePanel
        cfg={cfg}
        vpn={vpn}
        onPhrase={(p) => update((l) => ({ ...l, phrases: upsert(l.phrases, p) }))}
        onSession={(s) => update((l) => ({ ...l, sessions: [...l.sessions, s] }))}
      />
      {log && <ResultsPanel log={log} onClear={() => setLog(EMPTY_LOG)} />}
    </main>
  )
}

const upsert = (xs: ProbeLog['phrases'], p: ProbeLog['phrases'][number]) =>
  xs.some((x) => x.id === p.id) ? xs.map((x) => (x.id === p.id ? p : x)) : [...xs, p].slice(-300)
