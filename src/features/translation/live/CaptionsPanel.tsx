import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { db, type Id, type Sec } from '../../../db/schema'
import { setSetting, useSetting } from '../../../db/settings'
import { Icon } from '../../../lib/Icon'
import { fmtSecs } from '../../../lib/time'
import { prepareChromeTranslator, useLiveTranslator } from './useLiveTranslator'
import './captions.css'

const STT_LABEL = { 'webspeech-device': 'sul dispositivo', webspeech: 'Web Speech (Google)', 'gemini-chunks': 'Gemini' } as const

interface Props {
  lessonId: Id
  recording: boolean
  running: boolean
  now: () => Sec
  stream: () => MediaStream | null
}

/** Sottotitoli della lezione: originale + italiano, live durante la registrazione e salvati sulla timeline. */
export function CaptionsPanel({ lessonId, recording, running, now, stream }: Props) {
  const lesson = useLiveQuery(() => db.lessons.get(lessonId), [lessonId])
  const lines = useLiveQuery(() => db.transcript.where('lessonId').equals(lessonId).sortBy('ts'), [lessonId])
  const tr = useLiveQuery(async () => new Map((await db.translations.where('lessonId').equals(lessonId).toArray()).map((t) => [t.transcriptId, t.text])), [lessonId])
  const enabled = useSetting('live.captions') === 'on'
  const translator = useSetting('translator.provider')
  const spoken = lesson?.spokenLang ?? 'zh+en'
  const live = useLiveTranslator({ lessonId, spoken, enabled, running, now, stream })
  const [notice, setNotice] = useState('')
  const listRef = useRef<HTMLOListElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [lines?.length, tr?.size, live.interim])

  const toggle = () => {
    setNotice('')
    if (enabled) return void setSetting('live.captions', 'off')
    if (translator === 'chrome') void prepareChromeTranslator(spoken, setNotice).then((m) => m && setNotice(m))
    void setSetting('live.captions', 'on')
  }

  const status = !enabled ? 'Spenti' : !recording ? 'Partono quando registri' : !running ? 'In pausa' : live.state || 'Avvio…'

  return (
    <section className="cap" aria-label="Traduzione live">
      <header className="cap-bar">
        <button className={`ui-btn${enabled ? ' on' : ''}`} aria-pressed={enabled} onClick={toggle}>
          <Icon name="captions" /> Sottotitoli live
        </button>
        <span className={`ui-badge${enabled && running ? ' ok' : ''}`}>{status}</span>
        {live.setup && enabled && (
          <span className="ui-muted cap-setup">
            Parlato: {STT_LABEL[live.setup.stt]} · Traduzione: {live.setup.translator === 'chrome' ? 'Chrome offline' : live.setup.translator}
          </span>
        )}
        {/* Le impostazioni sono un'altra schermata: aprirle ora fermerebbe la registrazione. */}
        {!recording && <a className="ui-btn ghost sm" href="#impostazioni"><Icon name="settings" size={16} /> Cambia</a>}
      </header>
      {(live.error || notice) && <p className={live.error ? 'ui-error' : 'ui-muted'} role="status">{live.error || notice}</p>}

      {lines && lines.length === 0 && !live.interim ? (
        <div className="ui-empty">
          <Icon name="translate" size={32} />
          <p>Accendi i sottotitoli e registra: ogni frase del docente compare qui con la traduzione in italiano, legata al punto dell'audio.</p>
          <p className="ui-muted">Se riascoltando l'audio risulta muto, sul tuo tablet il riconoscimento ruba il microfono: spegni i sottotitoli o usa Gemini nelle impostazioni.</p>
        </div>
      ) : (
        <ol className="cap-list" ref={listRef} onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}>
          {lines?.map((l) => (
            <li key={l.id} className="cap-line">
              <span className="cap-ts mono">{fmtSecs(l.ts)}</span>
              {/* Finché la traduzione non arriva (o se non c'è, es. lezioni importate) si legge l'originale. */}
              {tr?.has(l.id) ? (
                <div>
                  <p className="cap-it">{tr.get(l.id)}</p>
                  <p className="cap-orig" lang={l.lang === 'zh' ? 'zh-CN' : l.lang}>{l.text}</p>
                </div>
              ) : (
                <p className="cap-it" lang={l.lang === 'zh' ? 'zh-CN' : l.lang}>{l.text}</p>
              )}
            </li>
          ))}
          {live.interim && <li className="cap-line interim"><span className="cap-ts mono">…</span><p className="cap-orig">{live.interim}</p></li>}
        </ol>
      )}
    </section>
  )
}
