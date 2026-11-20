import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../../lib/Icon'
import { ASR_MODELS, filesFor, type AsrModel } from './catalog'
import { cacheSize, clearModels, downloadAll, isCached } from './models'
import { INITIAL, OfflineTest, summary, type TestState } from './offlineTest'
import './offline.css'

const mb = (n: number) => `${(n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0)} MB`
const total = (m: AsrModel) => filesFor(m).reduce((s, f) => s + f.size, 0)

/** Quali modelli sono già tutti nella cache, e quanto spazio occupano. */
async function cacheStatus() {
  const entries = await Promise.all(ASR_MODELS.map(async (m) => [m.id, (await Promise.all(filesFor(m).map((f) => isCached(f.url)))).every(Boolean)] as const))
  return { ready: Object.fromEntries(entries) as Record<string, boolean>, used: await cacheSize() }
}

/** Prova del traduttore senza rete: ascolto sherpa-onnx + traduzione Bergamot, tutto sul tablet. */
export function OfflinePanel() {
  const [model, setModel] = useState<AsrModel>(ASR_MODELS[0])
  const [ready, setReady] = useState<Record<string, boolean>>({})
  const [used, setUsed] = useState(0)
  const [dl, setDl] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [state, setState] = useState<TestState>(INITIAL)
  const [copied, setCopied] = useState(false)
  const test = useRef<OfflineTest | null>(null)

  const apply = (st: Awaited<ReturnType<typeof cacheStatus>>) => {
    setReady(st.ready)
    setUsed(st.used)
  }
  const refresh = () => cacheStatus().then(apply)
  useEffect(() => {
    void cacheStatus().then(apply)
    return () => test.current?.dispose()
  }, [])

  const download = async () => {
    setDownloading(true)
    try {
      await downloadAll(filesFor(model), (p) =>
        setDl(`${mb(p.done)} di ${mb(p.total)} · ${p.speed ? `${mb(p.speed)}/s` : '…'} · ${p.file}${p.retry ? `
${p.retry}` : ''}`),
      )
      setDl('')
    } catch (e) {
      setDl(`Scaricamento interrotto: ${(e as Error).message}. Premi di nuovo «Scarica»: riparte dai pezzi già arrivati.${model.external ? ' Questo modello viene da Hugging Face: dalla Cina serve la VPN.' : ''}`)
    }
    setDownloading(false)
    await refresh()
  }

  const load = () => {
    test.current?.dispose()
    test.current = new OfflineTest(model, setState)
    void test.current.load()
  }

  const pick = (m: AsrModel) => {
    test.current?.dispose()
    test.current = null
    setState(INITIAL)
    setModel(m)
  }

  const s = state
  const rtf = s.doneSec ? s.asrMs / 1000 / s.doneSec : 0
  const busy = s.phase === 'loading' || s.phase === 'running'

  return (
    <section className="pr-card off">
      <h2>Traduttore senza rete (sherpa-onnx + Bergamot)</h2>
      <p className="pr-muted">Tutto gira sul tablet: ascolto e traduzione cinese→inglese→italiano. I modelli si scaricano una volta sola (in Cina con la VPN), poi la prova va fatta anche in modalità aereo.</p>

      <div className="off-models" role="radiogroup" aria-label="Modello di ascolto">
        {ASR_MODELS.map((m) => (
          <button key={m.id} className="ui-btn off-model" aria-pressed={m.id === model.id} disabled={busy || downloading} onClick={() => pick(m)}>
            <span>{m.label}</span>
            <span className="pr-muted">{mb(total(m))} in tutto{m.external ? ' · serve la VPN' : ''}{ready[m.id] ? ' · scaricato' : ''}</span>
          </button>
        ))}
      </div>

      <div className="pr-row">
        {!ready[model.id] && <button className="ui-btn primary" disabled={downloading} onClick={() => void download()}><Icon name="download" /> Scarica ({mb(total(model))})</button>}
        {ready[model.id] && <button className="ui-btn primary" disabled={busy} onClick={load}><Icon name="refresh" /> Carica i motori</button>}
        <button className="ui-btn ghost" disabled={busy || downloading || !used} onClick={() => void clearModels().then(refresh)}><Icon name="trash" /> Elimina modelli ({mb(used)})</button>
      </div>
      {dl && <p className="pr-muted off-dl" role="status">{dl}</p>}

      {s.phase !== 'idle' && (
        <>
          <p className={s.phase === 'error' ? 'pr-ko' : 'pr-muted'} role="status">{s.message}</p>
          {(s.phase === 'ready' || s.phase === 'done' || s.phase === 'running') && (
            <div className="pr-row">
              <button className="ui-btn" disabled={s.phase === 'running'} onClick={() => void test.current?.mic()}><Icon name="mic" /> Microfono</button>
              <label className={`ui-btn${s.phase === 'running' ? ' disabled' : ''}`}>
                <Icon name="upload" /> File audio
                <input type="file" accept="audio/*,video/webm" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void test.current?.file(f); e.target.value = '' }} />
              </label>
              {s.phase === 'running' && <button className="ui-btn" onClick={() => test.current?.stop()}><Icon name="stop" /> Ferma</button>}
            </div>
          )}
          <dl className="pr-status">
            <dt>Caricamento ascolto</dt><dd>{s.asrLoad ? `${(s.asrLoad.ms / 1000).toFixed(1)} s · memoria ${s.asrLoad.heapMB} MB` : '…'}</dd>
            <dt>Caricamento traduzione</dt><dd>{s.mtLoad ? `${(s.mtLoad.ms / 1000).toFixed(1)} s · memoria ${s.mtHeapMB} MB` : '…'}</dd>
            <dt>Audio elaborato</dt><dd>{s.doneSec.toFixed(1)} s</dd>
            <dt>Velocità (tempo reale)</dt><dd className={rtf > 1 ? 'pr-ko' : rtf > 0.7 ? 'off-warn' : ''}>{rtf ? `${rtf.toFixed(2)} ${rtf > 1 ? '(non regge)' : rtf > 0.7 ? '(al limite)' : '(regge)'}` : '…'}</dd>
            <dt>Ritardo del testo</dt><dd>adesso {Math.max(0, s.sentSec - s.doneSec).toFixed(1)} s · massimo {s.maxLag.toFixed(1)} s</dd>
          </dl>
          {s.partial && <p className="off-partial">{s.partial}</p>}
          <ol className="off-phrases">
            {[...s.phrases].reverse().map((p) => (
              <li key={p.id}>
                <p className="off-it">{p.it ?? '…'}</p>
                <p className="pr-muted" lang={p.lang === 'zh' ? 'zh-CN' : 'en'}>{p.text}{p.lang === 'zh' && p.en ? ` · ${p.en}` : ''}</p>
                {p.msIt !== undefined && <p className="pr-muted mono">{p.lang === 'zh' ? `zh→en ${p.msEn} ms · ` : ''}en→it {p.msIt} ms</p>}
              </li>
            ))}
          </ol>
          {(s.phase === 'done' || s.phrases.length > 0) && (
            <div className="pr-row">
              <button className="ui-btn" onClick={() => void navigator.clipboard.writeText(summary(model, s)).then(() => setCopied(true))}><Icon name="check" /> {copied ? 'Copiato' : 'Copia i risultati'}</button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
