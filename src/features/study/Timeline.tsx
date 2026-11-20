import { memo, useState } from 'react'
import { Icon, type IconName } from '../../lib/Icon'
import { fmtSecs } from '../../lib/time'
import type { EventKind, LessonEvent } from './events'
import type { LessonAudio } from '../../lib/lessonAudio'
import { useBlobUrl } from '../../lib/useBlobUrl'
import { lastAtOrBefore, useAudioValue } from './useAudioValue'

const KIND: Record<EventKind, { icon: IconName; label: string }> = {
  phrase: { icon: 'translate', label: 'Frasi' },
  note: { icon: 'note', label: 'Note' },
  slide: { icon: 'slides', label: 'Slide' },
  ink: { icon: 'pen', label: 'Penna' },
}

function Thumb({ id, blob }: { id: string; blob: Blob }) {
  const url = useBlobUrl(id, blob)
  return url ? <img className="st-thumb" src={url} alt="" loading="lazy" /> : null
}

interface RowProps { e: LessonEvent; now: boolean; canPlay: boolean; onPlay: (ts: number) => void }

/** Una riga: memo, così mentre l'audio avanza si ridisegnano solo la riga che smette e quella che diventa attuale. */
const Row = memo(function Row({ e, now, canPlay, onPlay }: RowProps) {
  return (
    <li>
      <button className={`st-ev ${e.kind}${now ? ' now' : ''}`} disabled={!canPlay} onClick={() => onPlay(e.ts)}>
        <span className="st-ev-ts mono"><Icon name="play" size={12} /> {fmtSecs(e.ts)}</span>
        <span className="st-ev-body">
          <span className="st-ev-title"><Icon name={KIND[e.kind].icon} size={14} /> {e.title}</span>
          {e.text && <span className="st-ev-text">{e.text}</span>}
          {e.original && <span className="st-ev-orig">{e.original}</span>}
        </span>
        {e.image && <Thumb id={e.key} blob={e.image} />}
      </button>
    </li>
  )
})

interface Props { events: LessonEvent[]; player: LessonAudio; canPlay: boolean; onPlay: (ts: number) => void }

/** Tutti i momenti della lezione: un tocco riascolta da lì. */
export function Timeline({ events, player, canPlay, onPlay }: Props) {
  const [filter, setFilter] = useState<EventKind | 'all'>('all')
  const shown = filter === 'all' ? events : events.filter((e) => e.kind === filter)
  // Solo l'indice della riga attuale: cambia di rado, il tempo invece avanza 4 volte al secondo.
  const current = useAudioValue(player, () => (player.playing || player.time > 0 ? lastAtOrBefore(shown, player.time) : -1))
  const kinds = (Object.keys(KIND) as EventKind[]).filter((k) => events.some((e) => e.kind === k))

  if (!events.length) return <div className="ui-empty"><Icon name="clock" size={32} /><p>Ancora niente sulla timeline: note, slide, scritti e frasi tradotte compariranno qui.</p></div>

  return (
    <div className="st-tl">
      <div className="st-filters" role="group" aria-label="Filtra la timeline">
        <button className="ui-btn sm" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Tutto · {events.length}</button>
        {kinds.map((k) => (
          <button key={k} className="ui-btn sm" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            <Icon name={KIND[k].icon} size={16} /> {KIND[k].label}
          </button>
        ))}
      </div>
      <ol className="st-events">
        {shown.map((e, i) => <Row key={e.key} e={e} now={i === current} canPlay={canPlay} onPlay={onPlay} />)}
      </ol>
    </div>
  )
}
