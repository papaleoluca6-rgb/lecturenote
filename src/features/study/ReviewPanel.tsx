import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback } from 'react'
import { db, type Id, type Sec } from '../../db/schema'
import type { LessonAudio } from '../../lib/lessonAudio'
import { pickAi } from './ai'
import { Flashcards } from './Flashcards'
import { PlayerBar } from './PlayerBar'
import { SummaryCard } from './SummaryCard'
import { Timeline } from './Timeline'
import { lessonText, loadTimeline } from './events'
import { useAudioValue } from './useAudioValue'
import './study.css'

/** Ripasso: riascolto da qualsiasi momento, riassunto e flashcard. */
export function ReviewPanel({ lessonId, recording, player }: { lessonId: Id; recording: boolean; player: LessonAudio }) {
  const lesson = useLiveQuery(() => db.lessons.get(lessonId), [lessonId])
  const events = useLiveQuery(() => loadTimeline(lessonId), [lessonId])
  const ai = useLiveQuery(() => pickAi(), []) ?? null
  // Il tempo che avanza lo seguono solo PlayerBar e la riga attuale della Timeline: qui basta sapere se c'è audio.
  const empty = useAudioValue(player, () => player.empty)
  const source = (maxChars: number) => lessonText(events ?? [], maxChars)
  const play = useCallback((ts: Sec) => player.playAt(ts), [player])

  if (!lesson || !events) return <p className="ui-muted">Caricamento…</p>

  return (
    <div className="st">
      <PlayerBar player={player} disabled={recording} />
      <div className="st-cols">
        <Timeline events={events} player={player} canPlay={!recording && !empty} onPlay={play} />
        <div className="st-side">
          <SummaryCard lesson={lesson} ai={ai} source={source} />
          <Flashcards lessonId={lessonId} ai={ai} source={source} now={() => player.time} onPlay={recording ? undefined : play} />
        </div>
      </div>
    </div>
  )
}
