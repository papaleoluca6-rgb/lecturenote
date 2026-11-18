import type { ReactNode } from 'react'
import { effectiveProvider, setSetting, useSetting } from '../../db/settings'
import { ApiKeyField } from './ApiKeyField'
import { ChoiceGroup } from './ChoiceGroup'
import './settings.css'

export function SettingsScreen({ onClose, children }: { onClose: () => void; children?: ReactNode }) {
  const noKey = !useSetting('apiKey.gemini')
  const stt = effectiveProvider('stt.provider', useSetting('stt.provider'), !noKey)
  const translator = effectiveProvider('translator.provider', useSetting('translator.provider'), !noKey)

  return (
    <main className="lib">
      <header className="lib-top">
        <h1>Impostazioni</h1>
        <button className="lib-btn" onClick={onClose}>← Libreria</button>
      </header>
      <section className="set-sec">
        <h2>Riconoscimento del parlato</h2>
        <ChoiceGroup name="stt" value={stt} onChange={(v) => setSetting('stt.provider', v)} choices={[
          { value: 'webspeech-device', label: 'Sul dispositivo', help: 'Gratis e offline, se questo Chrome lo supporta.' },
          { value: 'webspeech', label: 'Web Speech (server Google)', help: 'Gratis, ma usa i server Google: in Cina serve la VPN.' },
          { value: 'gemini-chunks', label: 'Gemini', help: 'Facoltativo, trascrive blocchi di audio con la tua chiave.', disabled: noKey },
        ]} />
      </section>
      <section className="set-sec">
        <h2>Traduzione</h2>
        <ChoiceGroup name="tr" value={translator} onChange={(v) => setSetting('translator.provider', v)} choices={[
          { value: 'chrome', label: 'Chrome offline', help: 'Gratis, gira sul tablet senza internet.' },
          { value: 'gemini', label: 'Gemini', help: 'Facoltativo, usa la tua chiave; serve la VPN in Cina.', disabled: noKey },
        ]} />
      </section>
      <ApiKeyField />
      {children}
    </main>
  )
}
