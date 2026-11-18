import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/schema'
import type { Id } from '../../db/schema'
import { Icon } from '../../lib/Icon'
import { CourseCard, type ExportRequest } from './CourseCard'
import { NewLessonForm } from './NewLessonForm'
import { createCourse, groupAndFilter } from './data'
import './library.css'

export function LibraryScreen({ onOpenLesson, onExport }: { onOpenLesson: (id: Id) => void; onExport?: (t: ExportRequest) => void }) {
  const courses = useLiveQuery(() => db.courses.toArray(), [])
  const lessons = useLiveQuery(() => db.lessons.toArray(), [])
  const [query, setQuery] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const add = async () => {
    if (!newName.trim()) return
    await createCourse(newName)
    setNewName('')
  }

  if (!courses || !lessons) return <main className="ui-page"><p className="ui-muted">Caricamento…</p></main>
  const groups = groupAndFilter(courses, lessons, query)
  const canRecord = courses.length > 0

  return (
    <main className="ui-page">
      <header className="ui-top">
        <h1 className="logo"><span className="logo-mark"><Icon name="wave" /></span>Lecture<em>Note</em></h1>
        <div className="ui-actions">
          <a className="ui-btn ghost icon-only" href="#impostazioni" aria-label="Impostazioni"><Icon name="settings" /></a>
          {canRecord && <button className="ui-btn primary" onClick={() => setCreating(true)}><Icon name="mic" /> Nuova lezione</button>}
        </div>
      </header>

      {creating && <NewLessonForm courses={courses} onCreated={onOpenLesson} onCancel={() => setCreating(false)} />}

      {courses.length === 0 ? (
        <section className="lib-welcome">
          <span className="logo-mark lib-welcome-mark"><Icon name="mic" size={28} /></span>
          <h2>Benvenuto in LectureNote</h2>
          <p className="ui-muted">Registra le lezioni, segui le slide, scrivi con la penna e leggi la traduzione in italiano. Tutto resta su questo tablet.</p>
          <form className="lib-newcourse" onSubmit={(e) => { e.preventDefault(); void add() }}>
            <input className="ui-input" placeholder="Nome del primo corso, es. Analisi 2" aria-label="Nome del corso" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button className="ui-btn primary" type="submit" disabled={!newName.trim()}><Icon name="plus" /> Crea corso</button>
          </form>
        </section>
      ) : (
        <>
          <div className="lib-tools">
            <label className="ui-search">
              <Icon name="search" />
              <input className="ui-input" type="search" placeholder="Cerca lezione o corso…" aria-label="Cerca" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <form className="lib-newcourse" onSubmit={(e) => { e.preventDefault(); void add() }}>
              <input className="ui-input" placeholder="Nuovo corso…" aria-label="Nome del nuovo corso" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <button className="ui-btn" type="submit" disabled={!newName.trim()}><Icon name="plus" /> Crea</button>
            </form>
          </div>
          {groups.length === 0 ? (
            <div className="ui-empty"><Icon name="search" size={32} /><p>Nessun risultato per «{query}».</p></div>
          ) : (
            <div className="lib-grid">{groups.map((g) => <CourseCard key={g.course.id} group={g} onOpenLesson={onOpenLesson} onExport={onExport} />)}</div>
          )}
        </>
      )}
    </main>
  )
}
