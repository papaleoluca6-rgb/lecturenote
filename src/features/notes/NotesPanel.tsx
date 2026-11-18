import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId, type Id, type Sec } from '../../db/schema'
import { NoteItem } from './NoteItem'
import { shrinkPhoto } from './photo'
import './notes.css'

const round2 = (n: number) => Math.round(n * 100) / 100

/** Note di testo e foto agganciate alla timeline. Il ts è quello del primo carattere scritto. */
export function NotesPanel({ lessonId, now }: { lessonId: Id; now: () => Sec }) {
  const notes = useLiveQuery(() => db.notes.where('lessonId').equals(lessonId).sortBy('ts'), [lessonId])
  const [text, setText] = useState('')
  const [startTs, setStartTs] = useState<Sec>()
  const [viewer, setViewer] = useState<string>()
  const [error, setError] = useState<string>()
  const draft = useRef({ text, startTs, now })
  useEffect(() => { draft.current = { text, startTs, now } })
  // Uscendo dalla lezione la bozza non aggiunta viene salvata, non persa.
  useEffect(() => () => {
    const { text: t, startTs: s, now: n } = draft.current
    if (t.trim()) void db.notes.add({ id: newId(), lessonId, ts: round2(s ?? n()), text: t.trim(), createdAt: Date.now() })
  }, [lessonId])

  const onChange = (v: string) => {
    if (!v) setStartTs(undefined)
    else if (!text) setStartTs(now())
    setText(v)
  }
  const reset = () => {
    setText('')
    setStartTs(undefined)
  }

  const add = async () => {
    const t = text.trim()
    if (!t) return
    await db.notes.add({ id: newId(), lessonId, ts: round2(startTs ?? now()), text: t, createdAt: Date.now() })
    reset()
  }

  const addPhoto = async (file: File | undefined) => {
    if (!file) return
    const ts = round2(now())
    const caption = text
    try {
      setError(undefined)
      const photo = await shrinkPhoto(file)
      await db.notes.add({ id: newId(), lessonId, ts, text: text.trim(), photo, createdAt: Date.now() })
      if (draft.current.text === caption) reset()
    } catch {
      setError('Impossibile salvare la foto')
    }
  }

  return (
    <div className="notes">
      <div className="notes-form">
        <textarea
          className="note-text"
          rows={3}
          placeholder="Scrivi una nota…"
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="notes-actions">
          <button className="note-btn primary" disabled={!text.trim()} onClick={() => void add()}>Aggiungi nota</button>
          <label className="note-btn">
            📷 Foto
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void addPhoto(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
        </div>
        {error && <p className="notes-error" role="alert">{error}</p>}
      </div>
      {notes && notes.length === 0 && <p className="notes-empty">Nessuna nota per questa lezione.</p>}
      <ul className="notes-list">
        {notes?.map((n) => <NoteItem key={n.id} note={n} onOpenPhoto={setViewer} />)}
      </ul>
      {viewer && (
        <div className="note-viewer" onClick={() => setViewer(undefined)}>
          <img src={viewer} alt="Foto della nota" />
          <button className="note-btn" onClick={() => setViewer(undefined)}>Chiudi</button>
        </div>
      )}
    </div>
  )
}
