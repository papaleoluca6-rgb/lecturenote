import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Id, type Sec } from '../../db/schema'
import { pickAi } from './ai'
import { Flashcards } from './Flashcards'
import { PlayerBar } from './PlayerBar'
import { SummaryCard } from './SummaryCard'
import { Timeline } from './Timeline'
import { lessonText, loadTimeline } from './events'
import { useLessonPlayer } from './usePlayer'
import './study.css'

/** Ripasso: riascolto da qualsiasi momento, riassunto e flashcard. */
export function ReviewPanel({ lessonId, recording }: { lessonId: Id; recording: boolean }) {
  const lesson = useLiveQuery(() => db.lessons.get(lessonId), [lessonId])
  const events = useLiveQuery(() => loadTimeline(lessonId), [lessonId])
  const ai = useLiveQuery(() => pickAi(), []) ?? null
  const player = useLessonPlayer(lessonId, recording)
  const source = () => lessonText(events ?? [])
  const play = (ts: Sec) => player.playAt(ts)

  if (!lesson || !events) return <p className="ui-muted">Caricamento…</p>

  return (
    <div className="st">
      <PlayerBar player={player} disabled={recording} />
      <div className="st-cols">
        <Timeline events={events} now={player.playing || player.time > 0 ? player.time : -1} canPlay={!recording && !player.empty} onPlay={play} />
        <div className="st-side">
          <SummaryCard lesson={lesson} ai={ai} source={source} />
          <Flashcards lessonId={lessonId} ai={ai} source={source} now={() => player.time} onPlay={recording ? undefined : play} />
        </div>
      </div>
    </div>
  )
}
