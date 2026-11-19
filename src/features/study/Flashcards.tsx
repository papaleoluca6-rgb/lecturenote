import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type Flashcard, type Id, type Sec } from '../../db/schema'
import { aiLabel } from '../../lib/ai'
import { Icon } from '../../lib/Icon'
import { fmtSecs } from '../../lib/time'
import { generateCards, type AiChoice } from './ai'
import { addCards, grade, isDue } from './cards'
import { textCutAt } from './events'

/** Ripasso a carte: mostra la domanda, poi la risposta, e chiede se la sapevi. */
function Review({ cards, onDone, onPlay }: { cards: Flashcard[]; onDone: () => void; onPlay?: (ts: Sec) => void }) {
  const [shown, setShown] = useState(false)
  const card = cards[0]
  if (!card) return (
    <div className="st-review done">
      <Icon name="check" size={32} />
      <p>Ripasso finito per ora.</p>
      <button className="ui-btn" onClick={onDone}>Chiudi</button>
    </div>
  )
  const answer = async (knew: boolean) => {
    await grade(card, knew)
    setShown(false)
  }
  return (
    <div className="st-review">
      <span className="ui-muted">{cards.length} da ripassare</span>
      <p className="st-q">{card.front}</p>
      {shown ? (
        <>
          <p className="st-a">{card.back}</p>
          <div className="ui-row st-grade">
            <button className="ui-btn" onClick={() => void answer(false)}><Icon name="refresh" /> Non la sapevo</button>
            <button className="ui-btn primary" onClick={() => void answer(true)}><Icon name="check" /> La sapevo</button>
          </div>
        </>
      ) : (
        <button className="ui-btn primary" onClick={() => setShown(true)}>Mostra la risposta</button>
      )}
      <div className="ui-row">
        {card.ts !== undefined && onPlay && <button className="ui-btn ghost sm" onClick={() => onPlay(card.ts!)}><Icon name="play" size={14} /> Riascolta da {fmtSecs(card.ts)}</button>}
        <button className="ui-btn ghost sm" onClick={onDone}>Interrompi</button>
      </div>
    </div>
  )
}

interface Props { lessonId: Id; ai: AiChoice | null; source: () => string; now: () => Sec; onPlay?: (ts: Sec) => void }

/** Flashcard della lezione: scritte a mano (sempre) o generate dall'AI facoltativa. */
export function Flashcards({ lessonId, ai, source, now, onPlay }: Props) {
  const cards = useLiveQuery(() => db.cards.where('lessonId').equals(lessonId).sortBy('createdAt'), [lessonId]) ?? []
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cut, setCut] = useState<string | null>(null)
  const due = cards.filter((c) => isDue(c)).sort((a, b) => a.due - b.due)

  const add = async () => {
    if (!front.trim() || !back.trim()) return
    await addCards(lessonId, [{ front, back, ts: now() || undefined }])
    setFront('')
    setBack('')
  }
  const generate = async () => {
    if (!ai) return
    const text = source()
    if (!text.trim()) return setError('Serve prima del testo: frasi trascritte o note.')
    setBusy(true)
    setError('')
    try {
      await addCards(lessonId, await generateCards(ai, text))
      setCut(textCutAt(text))
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const remove = (c: Flashcard) => { if (confirm('Eliminare questa flashcard?')) void db.cards.delete(c.id) }

  return (
    <section className="ui-card st-box">
      <header className="st-box-head">
        <h3><Icon name="cards" size={18} /> Flashcard <span className="ui-badge">{cards.length}</span></h3>
        {ai && <button className="ui-btn sm" disabled={busy} onClick={() => void generate()}><Icon name="sparkles" size={16} /> {busy ? 'Creo…' : `Crea con ${aiLabel(ai.id)}`}</button>}
        {cards.length > 0 && !reviewing && <button className="ui-btn primary sm" disabled={!due.length} onClick={() => setReviewing(true)}>Ripassa{due.length ? ` (${due.length})` : ''}</button>}
      </header>
      {cut && <p className="ui-muted">Testo troppo lungo: l'AI ha letto fino a {cut}.</p>}
      {error && <p className="ui-error" role="alert">{error}</p>}
      {reviewing ? (
        <Review cards={due} onDone={() => setReviewing(false)} onPlay={onPlay} />
      ) : (
        <>
          <form className="st-addcard" onSubmit={(e) => { e.preventDefault(); void add() }}>
            <input className="ui-input" placeholder="Domanda…" aria-label="Domanda" value={front} onChange={(e) => setFront(e.target.value)} />
            <input className="ui-input" placeholder="Risposta…" aria-label="Risposta" value={back} onChange={(e) => setBack(e.target.value)} />
            <button className="ui-btn" type="submit" disabled={!front.trim() || !back.trim()}><Icon name="plus" /> Aggiungi</button>
          </form>
          {cards.length > 0 && (
            <ul className="st-cards">
              {cards.map((c) => (
                <li key={c.id} className="st-card">
                  <div><strong>{c.front}</strong><span className="ui-muted">{c.back}</span></div>
                  {!isDue(c) && <span className="ui-badge ok" title="Torna più avanti">ok</span>}
                  <button className="ui-btn ghost icon-only sm" aria-label="Elimina flashcard" onClick={() => remove(c)}><Icon name="trash" size={16} /></button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
