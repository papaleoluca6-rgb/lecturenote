import { useState } from 'react'
import type { Id, Lesson } from '../../db/schema'
import { Icon } from '../../lib/Icon'
import { fmtSecs } from '../../lib/time'
import { deleteCourse, deleteLesson, formatDate, renameCourse, type CourseGroup } from './data'

const LANG_LABEL = { 'zh+en': '中/EN', zh: '中文', en: 'EN', it: 'IT' } as const

function LessonRow({ lesson, onOpen }: { lesson: Lesson; onOpen: () => void }) {
  const remove = () => {
    if (confirm(`Eliminare la lezione «${lesson.title}» con audio, slide, note e scritti? Non si può annullare.`)) void deleteLesson(lesson.id)
  }
  return (
    <li className="lib-lesson">
      <button className="lib-lesson-open" onClick={onOpen}>
        <span className="lib-lesson-title">{lesson.title}</span>
        <span className="lib-lesson-meta">
          {formatDate(lesson.date)}
          <span className="lib-dot" aria-hidden />
          <Icon name="clock" size={14} /> <span className="mono">{fmtSecs(lesson.durationSec)}</span>
          <span className="ui-badge">{LANG_LABEL[lesson.spokenLang]}</span>
        </span>
      </button>
      <button className="ui-btn ghost icon-only" onClick={remove} aria-label={`Elimina la lezione ${lesson.title}`}>
        <Icon name="trash" size={18} />
      </button>
    </li>
  )
}

export function CourseCard({ group, onOpenLesson }: { group: CourseGroup; onOpenLesson: (id: Id) => void }) {
  const { course, lessons } = group
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(course.name)
  const [confirming, setConfirming] = useState(false)
  const total = lessons.reduce((s, l) => s + l.durationSec, 0)

  const save = async () => {
    if (name.trim()) await renameCourse(course.id, name)
    setEditing(false)
  }
  const cancel = () => {
    setName(course.name)
    setEditing(false)
  }

  return (
    <section className="lib-course" style={{ '--course': course.color } as React.CSSProperties}>
      <header className="lib-course-head">
        {editing ? (
          <form className="ui-row" onSubmit={(e) => { e.preventDefault(); void save() }}>
            <input className="ui-input" value={name} autoFocus onChange={(e) => setName(e.target.value)} aria-label="Nome del corso" />
            <button className="ui-btn primary" type="submit">Salva</button>
            <button className="ui-btn" type="button" onClick={cancel}>Annulla</button>
          </form>
        ) : (
          <>
            <span className="lib-course-icon" aria-hidden><Icon name="book" /></span>
            <div className="lib-course-name">
              <h2>{course.name}</h2>
              <span className="ui-muted">{lessons.length === 1 ? '1 lezione' : `${lessons.length} lezioni`}{total > 0 && ` · ${fmtSecs(total)} di audio`}</span>
            </div>
            <button className="ui-btn ghost icon-only" onClick={() => setEditing(true)} aria-label="Rinomina il corso"><Icon name="edit" size={18} /></button>
            <button className="ui-btn ghost icon-only" onClick={() => setConfirming(true)} aria-label="Elimina il corso"><Icon name="trash" size={18} /></button>
          </>
        )}
      </header>
      {confirming && (
        <div className="lib-confirm" role="alertdialog" aria-label="Conferma eliminazione">
          <p>Eliminare «{course.name}» e tutte le sue lezioni (audio, slide, note, trascrizioni)? Non si può annullare.</p>
          <div className="ui-row">
            <button className="ui-btn record" onClick={() => void deleteCourse(course.id)}>Elimina tutto</button>
            <button className="ui-btn" onClick={() => setConfirming(false)}>Annulla</button>
          </div>
        </div>
      )}
      {lessons.length === 0 ? (
        <p className="ui-muted">Nessuna lezione in questo corso.</p>
      ) : (
        <ul className="lib-lessons">
          {lessons.map((l) => <LessonRow key={l.id} lesson={l} onOpen={() => onOpenLesson(l.id)} />)}
        </ul>
      )}
    </section>
  )
}
