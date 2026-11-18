import type { Sec } from '../../db/schema'
import { Icon } from '../../lib/Icon'
import type { LessonAudio } from '../../lib/lessonAudio'
import { fmtSecs } from '../../lib/time'
import { useAudioTick } from '../../lib/useLessonAudio'

interface Props {
  player: LessonAudio
  /** Primo momento in cui la slide corrente è stata mostrata registrando (undefined = mai). */
  at?: Sec
  follow: boolean
  onFollow: () => void
}

/** Riascolto dalle slide: play dal momento della slide corrente, pausa, e "l'audio segue le slide". */
export function SlideAudio({ player, at, follow, onFollow }: Props) {
  useAudioTick(player)
  if (player.empty) return null
  return (
    <>
      {player.playing ? (
        <button className="ui-btn" onClick={() => player.pause()} aria-label="Pausa"><Icon name="pause" /> <span className="mono">{fmtSecs(player.time)}</span></button>
      ) : (
        at !== undefined && (
          <button className="ui-btn" onClick={() => player.playAt(at)} aria-label={`Ascolta da ${fmtSecs(at)}, quando è comparsa questa slide`} title="Ascolta da quando è comparsa questa slide">
            <Icon name="play" /> <span className="mono">{fmtSecs(at)}</span>
          </button>
        )
      )}
      <button className="ui-btn icon-only" aria-pressed={follow} onClick={onFollow} aria-label="L'audio segue le slide" title="L'audio segue le slide: sfogliando riparte da quella slide, ascoltando le slide avanzano da sole">
        <Icon name="wave" />
      </button>
    </>
  )
}
