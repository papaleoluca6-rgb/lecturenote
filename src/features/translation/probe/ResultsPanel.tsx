import { useState } from 'react'
import type { ProbeLog } from './log'
import { buildTables, toMarkdown } from './report'

export function ResultsPanel({ log, onClear }: { log: ProbeLog; onClear: () => void }) {
  const [copied, setCopied] = useState('')
  const tables = buildTables(log)

  const copy = async () => {
    const md = toMarkdown(tables)
    try {
      await navigator.clipboard.writeText(md)
      setCopied('Copiato: incollalo nella chat.')
    } catch {
      setCopied('Copia automatica non riuscita: seleziona il testo qui sotto e copialo a mano.')
      const ta = document.getElementById('pr-md') as HTMLTextAreaElement | null
      ta?.select()
    }
  }
  const clear = () => {
    if (confirm('Cancellare tutti i risultati della prova?')) onClear()
  }

  return (
    <section className="pr-card">
      <h2>3 · Risultati</h2>
      <div className="pr-row">
        <button className="pr-btn primary" onClick={() => void copy()}>Copia risultati</button>
        <button className="pr-btn" onClick={clear}>Svuota</button>
        {copied && <span className="pr-muted" role="status">{copied}</span>}
      </div>
      {tables.map((t) => (
        <div key={t.title} className="pr-table-wrap">
          <h3>{t.title}</h3>
          {t.note && <p className="pr-muted">{t.note}</p>}
          {t.rows.length === 0 ? (
            <p className="pr-muted">Nessun dato.</p>
          ) : (
            <table className="pr-table">
              <thead><tr>{t.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {t.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
              </tbody>
            </table>
          )}
        </div>
      ))}
      <details>
        <summary className="pr-muted">Testo da copiare (Markdown)</summary>
        <textarea id="pr-md" className="pr-input pr-md" readOnly value={toMarkdown(tables)} />
      </details>
    </section>
  )
}
