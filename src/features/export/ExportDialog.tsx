import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../lib/Icon'
import { audioEstimate, audioFiles, type AudioEstimate } from './audioExport'
import { canShare, canShareFiles, download, filesLabel, startedNotice } from './download'
import { loadSource, textFile, type ExportFile, type ExportSource, type ExportTarget } from './notebooklm'
import './export.css'

const mb = (n: number) => `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)} MB`

function sizeLabel(est: AudioEstimate | null): string {
  if (!est || est.bytes <= 0) return ''
  const fmt = est.needsConversion && est.format !== 'none' ? ` ${est.format.toUpperCase()}` : ''
  return ` · circa ${mb(est.bytes)}${fmt}`
}

export function ExportDialog({ target, onClose }: { target: ExportTarget; onClose: () => void }) {
  const [src, setSrc] = useState<ExportSource | null | undefined>(undefined)
  const [original, setOriginal] = useState(true)
  const [audio, setAudio] = useState(false)
  const [est, setEst] = useState<AudioEstimate | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  /** File pronti da scaricare con un tocco (dopo una conversione lunga Chrome non conta più il primo tocco). */
  const [pending, setPending] = useState<{ key: string; files: ExportFile[] } | null>(null)
  /** File già pronti (la conversione è lunga: se la condivisione scade, si riprova senza rifarla). */
  const ready = useRef<{ key: string; files: ExportFile[] } | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    let live = true
    void loadSource(target).then(async (s) => {
      if (!live) return
      setSrc(s)
      if (s) {
        const e = await audioEstimate(s.lessons)
        if (live) setEst(e)
      }
    })
    return () => { live = false }
  }, [target])

  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [onClose])

  // Chiudendo la finestra si ferma anche la conversione.
  useEffect(() => () => abort.current?.abort(), [])

  const build = async (signal: AbortSignal): Promise<ExportFile[]> => {
    if (!src) return []
    const files = [await textFile(src, { original })]
    if (audio) {
      setProgress(0)
      const onProgress = (f: number) => setProgress(Math.min(99, Math.floor(f * 100)))
      files.push(...(await audioFiles(src.lessons, src.course, { signal, onProgress })))
    }
    return files
  }

  const run = async (mode: 'share' | 'download') => {
    const key = `${original}|${audio}`
    const ac = new AbortController()
    abort.current = ac
    setBusy(true)
    setError('')
    setNotice('')
    setPending(null)
    try {
      const cached = ready.current?.key === key ? ready.current.files : null
      const files = cached ?? (await build(ac.signal))
      ready.current = { key, files }
      if (mode === 'download') {
        // Con l'audio la conversione è lunga: i download partono da un nuovo tocco, non da soli.
        if (!cached && audio) {
          setPending({ key, files })
          return setNotice(`File pronti: tocca «Scarica ${filesLabel(files)}» per salvarli.`)
        }
        await download(files)
        return setNotice(startedNotice(files))
      }
      // Chrome condivide solo alcuni tipi di file (non .aac): quelli esclusi si scaricano con un tocco in più.
      const shareable = files.filter((f) => canShare([f.file]))
      const rest = files.filter((f) => !shareable.includes(f))
      try {
        if (shareable.length) await navigator.share({ files: shareable.map((f) => f.file), title: src?.title })
        if (rest.length) {
          setPending({ key, files: rest })
          setNotice(`Android non permette di condividere ${rest.length === 1 ? 'un file audio' : `${rest.length} file audio`}: tocca «Scarica ${filesLabel(rest)}», poi caricali in NotebookLM dalla cartella Download.`)
        }
      } catch (e) {
        // Dopo una conversione lunga Chrome non considera più la condivisione "chiesta dall'utente".
        if (!cached && e instanceof DOMException && e.name === 'NotAllowedError') {
          setNotice('File pronti: tocca di nuovo «Condividi» per inviarli.')
          return
        }
        throw e
      }
    } catch (e) {
      if (ac.signal.aborted) setNotice('Conversione annullata.')
      else if (!(e instanceof DOMException && e.name === 'AbortError')) setError(`Esportazione non riuscita: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      if (abort.current === ac) abort.current = null
      setBusy(false)
      setProgress(null)
    }
  }

  const savePending = async (files: ExportFile[]) => {
    setPending(null)
    setBusy(true)
    try {
      await download(files)
      setNotice(startedNotice(files))
    } finally {
      setBusy(false)
    }
  }

  const n = src?.lessons.length ?? 0
  const toSave = pending?.key === `${original}|${audio}` ? pending.files : null
  const what = src ? (src.kind === 'course' ? `Corso «${src.title}» · ${n === 1 ? '1 lezione' : `${n} lezioni`}` : `Lezione «${src.title}»`) : ''
  const noConvert = est?.needsConversion && est.format === 'none'

  return (
    <div className="ui-dialog" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ui-dialog-box" role="dialog" aria-modal="true" aria-label="Esporta per NotebookLM">
        <div className="exp-head">
          <h2><Icon name="export" /> Esporta per NotebookLM</h2>
          <button className="ui-btn ghost icon-only" onClick={onClose} aria-label="Chiudi"><Icon name="close" /></button>
        </div>
        {src === undefined && <p className="ui-muted">Caricamento…</p>}
        {src === null && <p className="ui-error">Niente da esportare: la lezione o il corso non esiste più.</p>}
        {src && (
          <>
            <p>{what}</p>
            <label className="ui-check">
              <input type="checkbox" checked={original} disabled={busy} onChange={(e) => setOriginal(e.target.checked)} />
              <span>Testo originale delle frasi<small>Sotto ogni frase tradotta aggiunge il cinese o l&apos;inglese.</small></span>
            </label>
            <label className="ui-check">
              <input type="checkbox" checked={audio} disabled={busy} onChange={(e) => setAudio(e.target.checked)} />
              <span>
                Audio della lezione (file separati){sizeLabel(est)}
                <small>
                  NotebookLM trascrive l&apos;audio da solo: utile se non hai usato la trascrizione live.
                  {noConvert
                    ? ' Questo browser non sa convertire l\'audio del registratore in un formato accettato da NotebookLM: aggiorna Chrome oppure esporta solo il testo.'
                    : ' L\'audio viene convertito in un formato che NotebookLM accetta (AAC, oppure WAV se il tablet non sa creare l\'AAC): per le lezioni lunghe può volerci qualche minuto.'}
                </small>
              </span>
            </label>
            <p className="exp-help">In NotebookLM: «Aggiungi fonte → Carica file». In Cina serve la VPN.</p>
            {progress !== null && (
              <div className="exp-progress" role="status">
                <span>Conversione audio… {progress}%</span>
                <progress max={100} value={progress} />
                <button className="ui-btn" onClick={() => abort.current?.abort()}><Icon name="close" /> Annulla</button>
              </div>
            )}
            {notice && <p className="ui-muted" role="status">{notice}</p>}
            {error && <p className="ui-error" role="alert">{error}</p>}
            <div className="exp-actions">
              {toSave && <button className="ui-btn primary" disabled={busy} onClick={() => void savePending(toSave)}><Icon name="download" /> Scarica {filesLabel(toSave)}</button>}
              {canShareFiles() && <button className="ui-btn" disabled={busy} onClick={() => void run('share')}><Icon name="share" /> Condividi</button>}
              <button className={`ui-btn${toSave ? '' : ' primary'}`} disabled={busy || n === 0} onClick={() => void run('download')}><Icon name="download" /> Scarica</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
