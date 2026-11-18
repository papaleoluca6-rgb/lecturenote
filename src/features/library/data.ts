import { db, lessonTables, newId, type Course, type Id, type Lesson, type SpokenLang } from '../../db/schema'

const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)']

export async function createCourse(name: string): Promise<void> {
  const n = await db.courses.count()
  await db.courses.add({ id: newId(), name: name.trim(), color: COLORS[n % COLORS.length], createdAt: Date.now() })
}

export async function createLesson(courseId: Id, title: string, spokenLang: SpokenLang): Promise<Id> {
  const now = Date.now()
  const id = newId()
  await db.lessons.add({ id, courseId, title: title.trim(), date: now, durationSec: 0, createdAt: now, updatedAt: now, spokenLang })
  return id
}

export async function renameCourse(id: string, name: string): Promise<void> {
  await db.courses.update(id, { name: name.trim() })
}

/** Elimina il corso, le sue lezioni e tutti i dati collegati alle lezioni. */
export async function deleteCourse(id: string): Promise<void> {
  const children = lessonTables()
  await db.transaction('rw', [db.courses, db.lessons, ...children], async () => {
    const lessonIds = await db.lessons.where('courseId').equals(id).primaryKeys()
    for (const t of children) await t.where('lessonId').anyOf(lessonIds).delete()
    await db.lessons.bulkDelete(lessonIds)
    await db.courses.delete(id)
  })
}

/** Elimina una lezione con audio, slide, note, penna, trascrizione e flashcard. */
export async function deleteLesson(id: Id): Promise<void> {
  const children = lessonTables()
  await db.transaction('rw', [db.lessons, ...children], async () => {
    for (const t of children) await t.where('lessonId').equals(id).delete()
    await db.lessons.delete(id)
  })
}

export interface CourseGroup {
  course: Course
  lessons: Lesson[]
}

/** Raggruppa le lezioni per corso (più recenti prima) e applica la ricerca su titolo e nome corso. */
export function groupAndFilter(courses: Course[], lessons: Lesson[], query: string): CourseGroup[] {
  const q = query.trim().toLowerCase()
  const sorted = [...lessons].sort((a, b) => b.date - a.date)
  const groups: CourseGroup[] = []
  for (const course of [...courses].sort((a, b) => a.name.localeCompare(b.name))) {
    const own = sorted.filter((l) => l.courseId === course.id)
    if (!q || course.name.toLowerCase().includes(q)) {
      groups.push({ course, lessons: own })
    } else {
      const hits = own.filter((l) => l.title.toLowerCase().includes(q))
      if (hits.length) groups.push({ course, lessons: hits })
    }
  }
  return groups
}

export const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
