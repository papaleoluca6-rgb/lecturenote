import { useState } from 'react'
import { Icon, type IconName } from '../../lib/Icon'
import { fmtSecs } from '../../lib/time'
import type { EventKind, LessonEvent } from './events'
import { useBlobUrl } from '../../lib/useBlobUrl'

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

/** Tutti i momenti della lezione: un tocco riascolta da lì. */
export function Timeline({ events, now, canPlay, onPlay }: { events: LessonEvent[]; now: number; canPlay: boolean; onPlay: (ts: number) => void }) {
  const [filter, setFilter] = useState<EventKind | 'all'>('all')
  const shown = filter === 'all' ? events : events.filter((e) => e.kind === filter)
  const current = shown.findLastIndex((e) => e.ts <= now)
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
        {shown.map((e, i) => (
          <li key={e.key}>
            <button className={`st-ev ${e.kind}${i === current ? ' now' : ''}`} disabled={!canPlay} onClick={() => onPlay(e.ts)}>
              <span className="st-ev-ts mono"><Icon name="play" size={12} /> {fmtSecs(e.ts)}</span>
              <span className="st-ev-body">
                <span className="st-ev-title"><Icon name={KIND[e.kind].icon} size={14} /> {e.title}</span>
                {e.text && <span className="st-ev-text">{e.text}</span>}
                {e.original && <span className="st-ev-orig">{e.original}</span>}
              </span>
              {e.image && <Thumb id={e.key} blob={e.image} />}
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
