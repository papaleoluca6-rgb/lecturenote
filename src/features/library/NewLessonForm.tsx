import { useState } from 'react'
import type { Course, Id, SpokenLang } from '../../db/schema'
import { createLesson, formatDate } from './data'

const LANGS: { value: SpokenLang; label: string }[] = [
  { value: 'zh+en', label: 'Cinese e inglese (alterna)' },
  { value: 'zh', label: 'Cinese' },
  { value: 'en', label: 'Inglese' },
  { value: 'it', label: 'Italiano' },
]

interface Props {
  courses: Course[]
  onCreated: (lessonId: Id) => void
  onCancel: () => void
}

/** Sceglie corso, titolo e lingua del docente, crea la lezione e apre la registrazione. */
export function NewLessonForm({ courses, onCreated, onCancel }: Props) {
  const sorted = [...courses].sort((a, b) => a.name.localeCompare(b.name))
  const [courseId, setCourseId] = useState(sorted[0]?.id ?? '')
  const [title, setTitle] = useState(() => `Lezione del ${formatDate(Date.now())}`)
  const [lang, setLang] = useState<SpokenLang>('zh+en')

  const submit = async () => {
    if (!courseId || !title.trim()) return
    onCreated(await createLesson(courseId, title, lang))
  }

  return (
    <form className="lib-newlesson" onSubmit={(e) => { e.preventDefault(); void submit() }}>
      <h2>Nuova lezione</h2>
      <label className="lib-field">
        <span className="ui-muted">Corso</span>
        <select className="ui-input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          {sorted.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="lib-field">
        <span className="ui-muted">Titolo</span>
        <input className="ui-input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="lib-field">
        <span className="ui-muted">Lingua del docente</span>
        <select className="ui-input" value={lang} onChange={(e) => setLang(e.target.value as SpokenLang)}>
          {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </label>
      <div className="ui-row">
        <button className="ui-btn primary" type="submit" disabled={!courseId || !title.trim()}>Vai alla registrazione</button>
        <button className="ui-btn" type="button" onClick={onCancel}>Annulla</button>
      </div>
    </form>
  )
}
