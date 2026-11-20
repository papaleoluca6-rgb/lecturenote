import { Icon } from '../../lib/Icon'
import { fmtSecs } from '../../lib/time'
import type { LessonAudio } from '../../lib/lessonAudio'
import { useAudioTick } from '../../lib/useLessonAudio'

/** Comandi di riascolto: play/pausa, ±10 s, barra del tempo su tutta la lezione. */
export function PlayerBar({ player, disabled }: { player: LessonAudio; disabled: boolean }) {
  useAudioTick(player)
  if (player.empty) return <p className="ui-muted st-noaudio">Nessun audio registrato: la timeline mostra comunque note, slide e frasi.</p>
  const total = player.total
  return (
    <div className="st-player" aria-label="Riascolto">
      <button className="ui-btn icon-only" disabled={disabled} onClick={() => player.skip(-10)} aria-label="Indietro di 10 secondi"><Icon name="undo" /></button>
      <button className="ui-btn primary icon-only st-play" disabled={disabled} onClick={() => player.toggle()} aria-label={player.playing ? 'Pausa' : 'Riproduci'}>
        <Icon name={player.playing ? 'pause' : 'play'} size={22} />
      </button>
      <button className="ui-btn icon-only st-fwd" disabled={disabled} onClick={() => player.skip(10)} aria-label="Avanti di 10 secondi"><Icon name="undo" /></button>
      <span className="mono st-time">{fmtSecs(player.time)}</span>
      <input
        className="st-seek"
        type="range"
        min={0}
        max={Math.max(1, Math.round(total))}
        step={1}
        value={Math.round(player.time)}
        disabled={disabled}
        aria-label="Posizione nella lezione"
        onChange={(e) => player.playAt(Number(e.target.value))}
      />
      <span className="mono st-time muted">{fmtSecs(total)}</span>
      {disabled && <p className="ui-muted st-hint">Ferma la registrazione per riascoltare.</p>}
    </div>
  )
}
