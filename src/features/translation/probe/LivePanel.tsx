import { useEffect, useRef, useState } from 'react'
import { TRANSLATORS, type AsrProviderId, type ProbeConfig } from './config'
import type { Phrase, SessionSummary } from './log'
import { ProbeSession, type LiveOptions, type LiveStatus } from './session'

interface Props {
  cfg: ProbeConfig
  vpn: boolean
  onPhrase: (p: Phrase) => void
  onSession: (s: SessionSummary) => void
}

const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x])

export function LivePanel({ cfg, vpn, onPhrase, onSession }: Props) {
  const [opts, setOpts] = useState<Omit<LiveOptions, 'vpn'>>({ wsLang: 'zh-CN', wsLocal: false, ai: [], blockSec: 6, translators: ['chrome'] })
  const [status, setStatus] = useState<LiveStatus | null>(null)
  const [error, setError] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [running, setRunning] = useState(false)
  const session = useRef<ProbeSession | null>(null)

  useEffect(() => () => void session.current?.stop(), [])
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl) }, [audioUrl])

  const start = async () => {
    setError('')
    setAudioUrl('')
    const s = new ProbeSession({ ...opts, vpn }, cfg, setStatus, onPhrase)
    session.current = s
    setRunning(true)
    try {
      await s.start()
    } catch (e) {
      session.current = null
      setRunning(false)
      setError(`Microfono non disponibile: ${(e as Error).message}`)
    }
  }
  const stop = async () => {
    const s = session.current
    session.current = null
    setRunning(false)
    if (!s) return
    const { summary, audio } = await s.stop()
    onSession(summary)
    setAudioUrl(URL.createObjectURL(audio))
  }

  return (
    <section className="pr-card">
      <h2>2 · Prova dal vivo</h2>
      <p className="pr-muted">La registrazione (MediaRecorder) è sempre attiva, come in una lezione vera. Parla o fai parlare un video in cinese/inglese.</p>
      <fieldset className="pr-opts" disabled={running}>
        <div className="pr-field">
          <span>Web Speech, lingua fissa</span>
          <select className="pr-input" value={opts.wsLang} onChange={(e) => setOpts({ ...opts, wsLang: e.target.value as LiveOptions['wsLang'] })}>
            <option value="">Nessuno</option>
            <option value="zh-CN">Cinese zh-CN</option>
            <option value="en-US">Inglese en-US</option>
          </select>
          <label className="pr-chip">
            <input type="checkbox" checked={opts.wsLocal} onChange={() => setOpts({ ...opts, wsLocal: !opts.wsLocal })} />
            Sul dispositivo (senza rete)
          </label>
        </div>
        <div className="pr-field">
          <span>Facoltativo, con chiave: AI su blocchi, lingua automatica</span>
          <div className="pr-chips">
            {(['gemini'] as AsrProviderId[]).map((id) => (
              <label key={id} className="pr-chip">
                <input type="checkbox" checked={opts.ai.includes(id)} onChange={() => setOpts({ ...opts, ai: toggle(opts.ai, id) })} />
                Gemini
              </label>
            ))}
            <select className="pr-input" value={opts.blockSec} onChange={(e) => setOpts({ ...opts, blockSec: Number(e.target.value) })}>
              {[4, 6, 8, 10].map((n) => <option key={n} value={n}>blocchi da {n} s</option>)}
            </select>
          </div>
        </div>
        <div className="pr-field">
          <span>Traduci ogni frase con</span>
          <div className="pr-chips">
            {TRANSLATORS.map((p) => (
              <label key={p.id} className="pr-chip">
                <input type="checkbox" checked={opts.translators.includes(p.id)} onChange={() => setOpts({ ...opts, translators: toggle(opts.translators, p.id) })} />
                {p.label}
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      {running ? (
        <button className="pr-btn stop" onClick={() => void stop()}>■ Ferma e salva risultato</button>
      ) : (
        <button className="pr-btn primary" onClick={() => void start()}>● Avvia prova</button>
      )}
      {error && <p className="pr-res ko">{error}</p>}
      {status && <LiveStatusView s={status} />}
      {audioUrl && (
        <div className="pr-field">
          <span>Riascolta la registrazione di prova (deve sentirsi la voce):</span>
          <audio controls src={audioUrl} />
        </div>
      )}
    </section>
  )
}

function LiveStatusView({ s }: { s: LiveStatus }) {
  return (
    <dl className="pr-status">
      <dt>Registrazione</dt>
      <dd>{s.recChunks} chunk · {Math.round(s.recBytes / 1024)} KB · {s.recMime || '…'}</dd>
      <dt>Livello audio</dt>
      <dd><meter min={0} max={0.3} value={s.level} /> max {s.levelMax.toFixed(3)}</dd>
      <dt>Web Speech</dt>
      <dd>{s.ws} · {s.wsFinals} frasi · {s.wsRestarts} riavvii{s.wsInterim && <> · <i>{s.wsInterim}</i></>}</dd>
      {s.wsErrors.length > 0 && <><dt>Errori WS</dt><dd className="pr-ko">{s.wsErrors.join(' · ')}</dd></>}
      <dt>AI su blocchi</dt>
      <dd>{s.aiOk}/{s.aiSent} risposte</dd>
      {s.aiErrors.length > 0 && <><dt>Errori AI</dt><dd className="pr-ko">{s.aiErrors.join(' · ')}</dd></>}
    </dl>
  )
}
