import Dexie, { type EntityTable } from 'dexie'

// Unico punto in cui è definito il modello dati. Tutto resta sul tablet (IndexedDB).
// Audio e immagini sono salvati come Blob, mai come base64.

export type Id = string
export const newId = (): Id => crypto.randomUUID()

/** Secondi dall'inizio della lezione (timeline unica per audio, note, slide, trascrizione). */
export type Sec = number

export type Lang = 'it' | 'en' | 'zh'

/** Lingua del docente per la lezione: una sola, oppure 'zh+en' se alterna cinese e inglese (riconoscimento per frase). */
export type SpokenLang = Lang | 'zh+en'

export interface Course {
  id: Id
  name: string
  color: string
  createdAt: number
}

export interface Lesson {
  id: Id
  courseId: Id
  title: string
  date: number
  durationSec: Sec
  createdAt: number
  updatedAt: number
  /** Lingua parlata dal docente: decide trascrizione e traduzione live. */
  spokenLang: SpokenLang
  aiSummary?: string
}

/** Una lezione può avere più segmenti (pausa lunga / "continua registrazione"): nessuno viene sovrascritto. */
export interface AudioSegment {
  id: Id
  lessonId: Id
  index: number
  startSec: Sec
  durationSec: Sec
  mime: string
  blob: Blob
}

export interface Slide {
  id: Id
  lessonId: Id
  deckName: string
  page: number
  image: Blob
  /** Miniatura piccola (campo non indicizzato: non serve una nuova versione dello schema). */
  thumb?: Blob
  width: number
  height: number
}

export interface SlidePin {
  id: Id
  lessonId: Id
  slideId: Id
  ts: Sec
}

export interface Note {
  id: Id
  lessonId: Id
  ts: Sec
  text: string
  photo?: Blob
  createdAt: number
}

/** Tratto vettoriale: [x, y, pressione] normalizzati 0..1 rispetto alla pagina. */
export interface Stroke {
  points: [number, number, number][]
  color: string
  size: number
  tool: 'pen' | 'highlighter'
  ts: Sec
}

/** Tipo di foglio delle pagine bianche. */
export type Paper = 'blank' | 'lines' | 'grid'

/** Pagina di scrittura a mano: bianca oppure sopra una slide (slideId). */
export interface InkPage {
  id: Id
  lessonId: Id
  slideId?: Id
  order: number
  strokes: Stroke[]
  /** Solo pagine bianche: bianco (default), a righe o a quadretti. Campo non indicizzato: nessuna nuova versione. */
  paper?: Paper
}

export interface TranscriptSegment {
  id: Id
  lessonId: Id
  ts: Sec
  endTs?: Sec
  lang: Lang
  text: string
  source: 'live' | 'ai'
}

export interface TranslationSegment {
  id: Id
  lessonId: Id
  transcriptId: Id
  ts: Sec
  from: Lang
  to: 'it'
  text: string
}

/** Flashcard di ripasso (scritta a mano o generata dall'AI facoltativa). Ripetizione a scatole di Leitner. */
export interface Flashcard {
  id: Id
  lessonId: Id
  front: string
  back: string
  /** Momento della lezione da cui viene (per riascoltare), se c'è. */
  ts?: Sec
  /** Scatola 0..4: più è alta, più tardi torna. */
  box: number
  /** Quando ripassarla (ms, Date.now()). */
  due: number
  createdAt: number
}

export interface Setting {
  key: string
  value: unknown
}

export const db = new Dexie('lecturenote') as Dexie & {
  courses: EntityTable<Course, 'id'>
  lessons: EntityTable<Lesson, 'id'>
  audio: EntityTable<AudioSegment, 'id'>
  slides: EntityTable<Slide, 'id'>
  pins: EntityTable<SlidePin, 'id'>
  notes: EntityTable<Note, 'id'>
  ink: EntityTable<InkPage, 'id'>
  transcript: EntityTable<TranscriptSegment, 'id'>
  translations: EntityTable<TranslationSegment, 'id'>
  settings: EntityTable<Setting, 'key'>
  cards: EntityTable<Flashcard, 'id'>
}

// Per cambiare lo schema: aggiungere db.version(2) sotto, MAI modificare la versione 1.
db.version(1).stores({
  courses: 'id, name',
  lessons: 'id, courseId, date',
  audio: 'id, lessonId, [lessonId+index]',
  slides: 'id, lessonId, [lessonId+page]',
  pins: 'id, lessonId, ts',
  notes: 'id, lessonId, ts',
  ink: 'id, lessonId, slideId',
  transcript: 'id, lessonId, ts',
  translations: 'id, lessonId, transcriptId, ts',
  settings: 'key',
})

// v2: flashcard di ripasso.
db.version(2).stores({
  cards: 'id, lessonId, due',
})

/** Tabelle con i dati di una lezione (indicizzate per lessonId): eliminare o reimportare una lezione le tocca tutte. */
export const lessonTables = () => [db.audio, db.slides, db.pins, db.notes, db.ink, db.transcript, db.translations, db.cards]
