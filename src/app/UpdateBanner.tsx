import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { allSaved } from '../features/recording/lessonRecorder'
import { Icon } from '../lib/Icon'
import './update.css'

const WAIT = 'Aspetto che l’audio della lezione sia salvato…'
const STUCK = 'L’audio di una lezione non si riesce a salvare: apri la lezione e segui l’avviso, poi riprova.'

/** Versione nuova pronta: si applica solo quando lo decide l'utente, dalla libreria (mai durante una lezione), dopo gli ultimi salvataggi dell'audio. */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  const [msg, setMsg] = useState('')
  const waiting = msg === WAIT
  if (!needRefresh) return null
  const update = async () => {
    setMsg(WAIT)
    // Prima si finisce di salvare l'audio; se un salvataggio continua a fallire, si resta qui e lo si dice.
    const done = await Promise.race([allSaved().then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 20_000))])
    if (done) void updateServiceWorker(true)
    else setMsg(STUCK)
  }
  return (
    <div className="update-banner" role="status">
      <span>{msg || 'È disponibile una versione nuova dell’app.'}</span>
      <button className="ui-btn primary" disabled={waiting} onClick={() => void update()}><Icon name="refresh" size={18} /> Aggiorna</button>
    </div>
  )
}
