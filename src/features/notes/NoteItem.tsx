import { useState } from 'react'
import { db, type Note } from '../../db/schema'
import { fmtSecs } from '../../lib/time'
import { useBlobUrl } from '../../lib/useBlobUrl'
import { Icon } from '../../lib/Icon'

/** Una nota dell'elenco: tempo, testo modificabile (salva al blur), miniatura foto, elimina. */
export function NoteItem({ note, onOpenPhoto }: { note: Note; onOpenPhoto: (url: string) => void }) {
  const url = useBlobUrl(note.photo ? note.id : undefined, note.photo)
  const [draft, setDraft] = useState<string>()
  const value = draft ?? note.text

  const save = () => {
    // Una nota di solo testo svuotata torna com'era (per toglierla c'è il cestino).
    const emptied = !note.photo && !draft?.trim()
    if (draft !== undefined && draft !== note.text && !emptied) void db.notes.update(note.id, { text: draft })
    setDraft(undefined)
  }
  const remove = () => {
    if (window.confirm('Eliminare questa nota?')) void db.notes.delete(note.id)
  }

  return (
    <li className="note-item">
      <span className="note-ts">{fmtSecs(note.ts)}</span>
      <div className="note-body">
        {url && (
          <button className="note-thumb" aria-label="Apri la foto" onClick={() => onOpenPhoto(url)}>
            <img src={url} loading="lazy" alt="" />
          </button>
        )}
        <textarea
          className="note-text"
          rows={2}
          value={value}
          placeholder={note.photo ? 'Didascalia' : ''}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
        />
      </div>
      <button className="note-del" aria-label="Elimina nota" onClick={remove}><Icon name="trash" /></button>
    </li>
  )
}
