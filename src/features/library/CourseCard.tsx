import { useState } from 'react'
import type { Id } from '../../db/schema'
import { fmtSecs } from '../../lib/time'
import { deleteCourse, formatDate, renameCourse, type CourseGroup } from './data'

export function CourseCard({ group, onOpenLesson }: { group: CourseGroup; onOpenLesson: (id: Id) => void }) {
  const { course, lessons } = group
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(course.name)
  const [confirming, setConfirming] = useState(false)

  const save = async () => {
    if (name.trim()) await renameCourse(course.id, name)
    setEditing(false)
  }
  const cancel = () => {
    setName(course.name)
    setEditing(false)
  }

  return (
    <section className="lib-course" style={{ borderLeftColor: course.color }}>
      <header className="lib-course-head">
        {editing ? (
          <form className="ui-row" onSubmit={(e) => { e.preventDefault(); void save() }}>
            <input className="ui-input" value={name} autoFocus onChange={(e) => setName(e.target.value)} aria-label="Nome del corso" />
            <button className="ui-btn primary" type="submit">Salva</button>
            <button className="ui-btn" type="button" onClick={cancel}>Annulla</button>
          </form>
        ) : (
          <>
            <h2>{course.name}</h2>
            <span className="ui-muted">{lessons.length} lezioni</span>
            <button className="ui-btn" onClick={() => setEditing(true)}>Rinomina</button>
            <button className="ui-btn danger" onClick={() => setConfirming(true)}>Elimina</button>
          </>
        )}
      </header>
      {confirming && (
        <div className="lib-confirm" role="alertdialog">
          <p>Eliminare «{course.name}» e tutte le sue lezioni (audio, slide, note, trascrizioni)? Non si può annullare.</p>
          <div className="ui-row">
            <button className="ui-btn danger" onClick={() => void deleteCourse(course.id)}>Elimina tutto</button>
            <button className="ui-btn" onClick={() => setConfirming(false)}>Annulla</button>
          </div>
        </div>
      )}
      {lessons.length === 0 ? (
        <p className="ui-muted">Nessuna lezione in questo corso.</p>
      ) : (
        <ul className="lib-lessons">
          {lessons.map((l) => (
            <li key={l.id}>
              <button className="lib-lesson" onClick={() => onOpenLesson(l.id)}>
                <span>{l.title}</span>
                <span className="ui-muted">{formatDate(l.date)} · {fmtSecs(l.durationSec)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
