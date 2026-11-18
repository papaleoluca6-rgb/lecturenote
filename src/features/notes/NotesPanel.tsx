import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId, type Id, type Sec } from '../../db/schema'
import { NoteItem } from './NoteItem'
import { PhotoViewer } from './PhotoViewer'
import { shrinkPhoto } from './photo'
import './notes.css'
import { Icon } from '../../lib/Icon'

const round2 = (n: number) => Math.round(n * 100) / 100

/** Note di testo e foto agganciate alla timeline. Il ts è quello del primo carattere scritto. */
export function NotesPanel({ lessonId, now, onFlush }: { lessonId: Id; now: () => Sec; onFlush: (fn: () => Promise<void>) => () => void }) {
  const notes = useLiveQuery(() => db.notes.where('lessonId').equals(lessonId).sortBy('ts'), [lessonId])
  const [text, setText] = useState('')
  const [startTs, setStartTs] = useState<Sec>()
  const [viewer, setViewer] = useState<string>()
  const closeViewer = useCallback(() => setViewer(undefined), [])
  const [error, setError] = useState<string>()
  const draft = useRef({ text, startTs, now })
  const saving = useRef(false)
  useEffect(() => { draft.current = { text, startTs, now } })

  const reset = () => {
    draft.current.text = ''
    setText('')
    setStartTs(undefined)
  }
  /** Salva la bozza come nota (una sola volta alla volta). Usata da «Aggiungi nota» e prima di chiudere la lezione. */
  const flush = async () => {
    const { text: t, startTs: s, now: n } = draft.current
    if (saving.current || !t.trim()) return
    saving.current = true
    try {
      await db.notes.add({ id: newId(), lessonId, ts: round2(s ?? n()), text: t.trim(), createdAt: Date.now() })
      reset()
    } finally {
      saving.current = false
    }
  }
  const flushRef = useRef(flush)
  useEffect(() => { flushRef.current = flush })
  useEffect(() => {
    const off = onFlush(() => flushRef.current())
    return () => {
      off()
      // Uscita senza passare da close() (es. cambio schermata): salva solo se la lezione esiste ancora.
      void db.lessons.get(lessonId).then((l) => l && flushRef.current())
    }
  }, [lessonId, onFlush])

  const onChange = (v: string) => {
    if (!v) setStartTs(undefined)
    else if (!text) setStartTs(now())
    setText(v)
  }

  const add = async () => {
    try {
      setError(undefined)
      await flush()
    } catch {
      setError('Impossibile salvare la nota')
    }
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
          <button className="ui-btn primary" disabled={!text.trim()} onClick={() => void add()}><Icon name="plus" /> Aggiungi nota</button>
          <label className="ui-btn">
            <Icon name="camera" /> Foto
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
      {notes && notes.length === 0 && <div className="ui-empty"><Icon name="note" size={32} /><p>Nessuna nota per questa lezione. Il tempo di ogni nota è quello in cui inizi a scriverla.</p></div>}
      <ul className="notes-list">
        {notes?.map((n) => <NoteItem key={n.id} note={n} onOpenPhoto={setViewer} />)}
      </ul>
      {viewer && <PhotoViewer url={viewer} onClose={closeViewer} />}
    </div>
  )
}
