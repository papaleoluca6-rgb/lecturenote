import { useCallback, useEffect, useRef, useState } from 'react'
import { db, type Id, type Lesson } from '../../db/schema'
import { aiLabel } from '../../lib/ai'
import { Icon } from '../../lib/Icon'
import { aiMaxChars, summarize, type AiChoice } from './ai'
import { textCutAt } from './events'

/** Riassunto della lezione: si scrive a mano, oppure lo prepara l'AI facoltativa (poi resta modificabile). */
export function SummaryCard({ lesson, ai, source }: { lesson: Lesson; ai: AiChoice | null; source: (maxChars: number) => string }) {
  const [draft, setDraft] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cut, setCut] = useState<string | null>(null)
  /** Modifica non ancora salvata, con la sua lezione (il salvataggio può arrivare dopo un cambio di lezione). */
  const unsaved = useRef<{ id: Id; text: string } | null>(null)
  const value = draft ?? lesson.aiSummary ?? ''

  const save = (text: string) => db.lessons.update(lesson.id, { aiSummary: text, updatedAt: Date.now() })
  const flush = useCallback(() => {
    const u = unsaved.current
    if (!u) return
    unsaved.current = null
    void db.lessons.update(u.id, { aiSummary: u.text, updatedAt: Date.now() })
  }, [])

  // Salva 1 s dopo l'ultimo tasto: se Android chiude la scheda in background il testo non va perso.
  useEffect(() => {
    if (draft === undefined) return
    const t = setTimeout(flush, 1000)
    return () => clearTimeout(t)
  }, [draft, flush])
  // …e subito quando l'app va in background o il riquadro si chiude.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onHide)
    addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  const generate = async () => {
    if (!ai) return
    const text = source(aiMaxChars(ai))
    if (!text.trim()) return setError('Serve prima del testo: frasi trascritte o note.')
    if (value.trim() && !confirm('Sostituire il riassunto attuale?')) return
    unsaved.current = null
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
        onChange={(e) => {
          setDraft(e.target.value)
          unsaved.current = { id: lesson.id, text: e.target.value }
        }}
        onBlur={flush}
      />
      {cut && <p className="ui-muted">Testo troppo lungo: l'AI ha letto fino a {cut}.</p>}
      {error && <p className="ui-error" role="alert">{error}</p>}
    </section>
  )
}
