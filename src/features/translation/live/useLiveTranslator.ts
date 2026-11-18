import { useEffect, useRef, useState } from 'react'
import type { Id, Sec, SpokenLang } from '../../../db/schema'
import { getTranslator, translatorAvailability } from '../probe/onDevice'
import { LiveTranslator, loadSetup, type LiveSetup } from './engine'

interface Opts {
  lessonId: Id
  spoken: SpokenLang
  enabled: boolean
  /** true solo mentre l'audio scorre: in pausa l'ascolto si ferma. */
  running: boolean
  now: () => Sec
  stream: () => MediaStream | null
}

/** Avvia e ferma il traduttore live seguendo il registratore; espone stato, testo provvisorio ed errori. */
export function useLiveTranslator({ lessonId, spoken, enabled, running, now, stream }: Opts) {
  const [setup, setSetup] = useState<LiveSetup>()
  const [state, setState] = useState('')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')
  const clock = useRef({ now, stream })
  useEffect(() => { clock.current = { now, stream } })

  useEffect(() => {
    if (enabled) void loadSetup().then(setSetup)
  }, [enabled])

  useEffect(() => {
    if (!enabled || !running || !setup) return
    const t = new LiveTranslator(lessonId, spoken, setup, () => clock.current.now(), {
      onState: setState,
      onInterim: setInterim,
      onError: (m) => setError(m),
    })
    t.start(clock.current.stream())
    return () => {
      t.stop()
      setError('')
      setState('')
      setInterim('')
    }
  }, [enabled, running, setup, lessonId, spoken])

  return { setup, state, interim, error }
}

/** Lingue da cui tradurre per la lingua del docente. */
const sources = (spoken: SpokenLang): ('zh' | 'en')[] => (spoken === 'zh+en' ? ['zh', 'en'] : spoken === 'it' ? [] : [spoken])

/**
 * Prepara il traduttore offline di Chrome: va chiamata dentro il tocco dell'utente, perché il primo
 * scaricamento del modello lo richiede. Restituisce un messaggio d'errore leggibile, o ''.
 */
export async function prepareChromeTranslator(spoken: SpokenLang, onProgress: (msg: string) => void): Promise<string> {
  const langs = sources(spoken)
  // Subito, prima di qualsiasi attesa: così il tocco vale ancora come gesto dell'utente.
  for (const from of langs) getTranslator(from, (pct) => onProgress(`Scarico il modello di traduzione (${from}→it): ${pct}%`)).catch(() => {})
  for (const from of langs) {
    // Alcune build di Chrome non rispondono mai: in quel caso non si sa e si prova lo stesso.
    const a = await translatorAvailability(from).catch(() => 'unknown' as const)
    if (a === 'no-api') return "La traduzione offline di Chrome non c'è su questo browser: aggiorna Chrome o scegli un'altra traduzione nelle impostazioni."
    if (a === 'unavailable') return `Chrome non sa tradurre ${from === 'zh' ? 'dal cinese' : "dall'inglese"} su questo dispositivo: scegli un'altra traduzione nelle impostazioni.`
  }
  return ''
}
