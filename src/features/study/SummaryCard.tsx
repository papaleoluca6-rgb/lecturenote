import { useState } from 'react'
import { db, type Lesson } from '../../db/schema'
import { aiLabel } from '../../lib/ai'
import { Icon } from '../../lib/Icon'
import { summarize, type AiChoice } from './ai'
import { textCutAt } from './events'

/** Riassunto della lezione: si scrive a mano, oppure lo prepara l'AI facoltativa (poi resta modificabile). */
export function SummaryCard({ lesson, ai, source }: { lesson: Lesson; ai: AiChoice | null; source: () => string }) {
  const [draft, setDraft] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cut, setCut] = useState<string | null>(null)
  const value = draft ?? lesson.aiSummary ?? ''

  const save = (text: string) => db.lessons.update(lesson.id, { aiSummary: text, updatedAt: Date.now() })
  const generate = async () => {
    const text = source()
    if (!ai) return
    if (!text.trim()) return setError('Serve prima del testo: frasi trascritte o note.')
    if (value.trim() && !confirm('Sostituire il riassunto attuale?')) return
    setBusy(true)
    setError('')
    try {
      const out = await summarize(ai, text)
      await save(out)
      setDraft(undefined)
      setCut(textCutAt(text))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="ui-card st-box">
      <header className="st-box-head">
        <h3><Icon name="book" size={18} /> Riassunto</h3>
        {ai && (
          <button className="ui-btn sm" disabled={busy} onClick={() => void generate()}>
            <Icon name="sparkles" size={16} /> {busy ? 'Scrivo…' : `Genera con ${aiLabel(ai.id)}`}
          </button>
        )}
      </header>
      <textarea
        className="ui-input st-summary"
        rows={8}
        placeholder={ai ? 'Scrivi qui il riassunto, o fallo preparare all\'AI.' : 'Scrivi qui il riassunto della lezione. (Con una chiave AI facoltativa nelle impostazioni può prepararlo l\'AI.)'}
        value={value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== undefined && draft !== (lesson.aiSummary ?? '')) void save(draft).then(() => setDraft(undefined)) }}
      />
      {cut && <p className="ui-muted">Testo troppo lungo: l'AI ha letto fino a {cut}.</p>}
      {error && <p className="ui-error" role="alert">{error}</p>}
    </section>
  )
}
