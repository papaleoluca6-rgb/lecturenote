import { useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type AudioSegment, type Id } from '../../db/schema'
import { fmtSecs } from '../../lib/time'

function SegmentItem({ seg }: { seg: AudioSegment }) {
  // L'URL del Blob vive quanto l'elemento <audio>: creato al montaggio, revocato alla rimozione.
  const { blob } = seg
  const attach = useCallback(
    (el: HTMLAudioElement | null) => {
      if (!el) return
      const url = URL.createObjectURL(blob)
      el.src = url
      return () => URL.revokeObjectURL(url)
    },
    [blob],
  )

  return (
    <li className="rec-seg">
      <span className="rec-seg-label">
        Parte {seg.index + 1} · <span className="mono">{fmtSecs(seg.startSec)}</span> · {fmtSecs(seg.durationSec)}
      </span>
      <audio ref={attach} controls preload="metadata" />
    </li>
  )
}

/** Segmenti audio già salvati della lezione, riascoltabili. */
export function SegmentList({ lessonId }: { lessonId: Id }) {
  const segs = useLiveQuery(() => db.audio.where('lessonId').equals(lessonId).sortBy('index'), [lessonId])
  if (!segs?.length) return <p className="rec-muted">Nessun audio registrato per questa lezione.</p>
  return (
    <ul className="rec-segs" aria-label="Parti registrate">
      {segs.map((s) => <SegmentItem key={s.id} seg={s} />)}
    </ul>
  )
}
