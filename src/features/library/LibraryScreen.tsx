import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/schema'
import type { Id } from '../../db/schema'
import { CourseCard } from './CourseCard'
import { NewLessonForm } from './NewLessonForm'
import { createCourse, groupAndFilter } from './data'
import './library.css'

export function LibraryScreen({ onOpenLesson }: { onOpenLesson: (id: Id) => void }) {
  const courses = useLiveQuery(() => db.courses.toArray(), [])
  const lessons = useLiveQuery(() => db.lessons.toArray(), [])
  const [query, setQuery] = useState('')
  const [newName, setNewName] = useState('')
  const [notice, setNotice] = useState('')
  const [creating, setCreating] = useState(false)

  const add = async () => {
    if (!newName.trim()) return
    await createCourse(newName)
    setNewName('')
  }
  const newLesson = () => {
    if (!courses?.length) return setNotice('Crea prima un corso, poi potrai registrare una lezione.')
    setNotice('')
    setCreating(true)
  }

  if (!courses || !lessons) return <main className="ui-page"><p className="ui-muted">Caricamento…</p></main>
  const groups = groupAndFilter(courses, lessons, query)

  return (
    <main className="ui-page">
      <header className="ui-top">
        <h1 className="logo">Lecture<em>Note</em></h1>
        <div className="ui-actions">
          <a className="ui-btn" href="#impostazioni">⚙ Impostazioni</a>
          <a className="ui-btn" href="#prova">Prova traduttore</a>
          <button className="ui-btn primary" onClick={newLesson}>+ Nuova lezione</button>
        </div>
      </header>
      {notice && <p className="lib-notice" role="status">{notice}</p>}
      {creating && <NewLessonForm courses={courses} onCreated={onOpenLesson} onCancel={() => setCreating(false)} />}
      <input className="ui-input" type="search" placeholder="Cerca lezione o corso…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <form className="ui-row" onSubmit={(e) => { e.preventDefault(); void add() }}>
        <input className="ui-input" placeholder="Nome del nuovo corso" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="ui-btn" type="submit" disabled={!newName.trim()}>Crea corso</button>
      </form>
      {courses.length === 0 ? (
        <div className="lib-empty">
          <p>Nessun corso ancora.</p>
          <p className="ui-muted">Crea il primo corso qui sopra, poi registra una lezione.</p>
          <button className="ui-btn primary" onClick={newLesson}>+ Nuova lezione</button>
        </div>
      ) : groups.length === 0 ? (
        <p className="lib-empty ui-muted">Nessun risultato per «{query}».</p>
      ) : (
        <div className="lib-grid">{groups.map((g) => <CourseCard key={g.course.id} group={g} onOpenLesson={onOpenLesson} />)}</div>
      )}
    </main>
  )
}
