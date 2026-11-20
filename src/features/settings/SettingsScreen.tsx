import type { ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/schema'
import { CHAT_PROVIDERS } from '../../lib/aiProviders'
import { chromeTranslatorAvailable, deviceSpeechAvailable, effectiveProvider, setSetting, useSetting, type SettingKey } from '../../db/settings'
import { ApiKeyField } from './ApiKeyField'
import { ChoiceGroup } from './ChoiceGroup'
import './settings.css'
import { Icon } from '../../lib/Icon'

const NOT_HERE = 'non disponibile su questo dispositivo'

export function SettingsScreen({ onClose, children }: { onClose: () => void; children?: ReactNode }) {
  const keyRows = useLiveQuery(() => db.settings.where('key').startsWith('apiKey.').toArray(), [])
  const hasKey = (k: SettingKey) => !!keyRows?.some((r) => r.key === k && r.value)
  const noKey = !hasKey('apiKey.gemini')
  const stt = effectiveProvider('stt.provider', useSetting('stt.provider'), hasKey)
  const translator = effectiveProvider('translator.provider', useSetting('translator.provider'), hasKey)

  return (
    <main className="ui-page">
      <header className="ui-top">
        <h1>Impostazioni</h1>
        <button className="ui-btn" onClick={onClose}><Icon name="back" /> Libreria</button>
      </header>
      <section className="ui-sec">
        <h2>Riconoscimento del parlato</h2>
        <ChoiceGroup name="stt" label="Riconoscimento del parlato" value={stt} onChange={(v) => setSetting('stt.provider', v)} choices={[
          { value: 'webspeech-device', label: 'Sul dispositivo', help: "Gratis, l'audio resta sul tablet (Chrome scarica una volta il pacchetto della lingua).", disabled: !deviceSpeechAvailable(), offNote: NOT_HERE },
          { value: 'webspeech', label: 'Web Speech (server Google)', help: 'Gratis, ma usa i server Google: in Cina serve la VPN.' },
          { value: 'gemini-chunks', label: 'Gemini', help: 'Facoltativo, trascrive blocchi di audio con la tua chiave.', disabled: noKey },
        ]} />
      </section>
      <section className="ui-sec">
        <h2>Traduzione</h2>
        <ChoiceGroup name="tr" label="Traduzione" value={translator} onChange={(v) => setSetting('translator.provider', v)} choices={[
          { value: 'chrome', label: 'Chrome offline', help: 'Gratis, gira sul tablet senza internet.', disabled: !chromeTranslatorAvailable(), offNote: `${NOT_HERE}: senza una chiave si salvano solo le frasi originali` },
          { value: 'gemini', label: 'Gemini', help: 'Facoltativo, usa la tua chiave; serve la VPN in Cina.', disabled: noKey },
          ...CHAT_PROVIDERS.map((p) => ({
            value: p.id,
            label: p.label,
            help: 'Facoltativo, usa la tua chiave; funziona in Cina senza VPN.',
            disabled: !hasKey(`apiKey.${p.id}`),
          })),
        ]} />
      </section>
      <ApiKeyField
        settingKey="apiKey.gemini"
        title="Gemini"
        help="Facoltativa, gratuita nel piano free di Google, resta solo su questo tablet. Serve per trascrivere con Gemini e per la traduzione Gemini. L'app funziona del tutto anche senza."
      />
      {CHAT_PROVIDERS.map((p) => (
        <ApiKeyField
          key={p.id}
          settingKey={`apiKey.${p.id}`}
          title={p.label}
          help={`Facoltativa, solo per la traduzione: la crei su ${p.keyHelp}. Resta solo su questo tablet; il costo dipende dal tuo piano con ${p.label}.`}
        />
      ))}
      <section className="ui-sec">
        <h2>Lingua predefinita del docente</h2>
        <ChoiceGroup name="lang" label="Lingua predefinita del docente" value={useSetting('ui.recordingDefaultLang')} onChange={(v) => setSetting('ui.recordingDefaultLang', v)} choices={[
          { value: 'zh+en', label: 'Cinese e inglese', help: 'Il docente alterna le due lingue: la lingua si riconosce frase per frase.' },
          { value: 'zh', label: 'Cinese', help: 'Traduzione cinese → italiano.' },
          { value: 'en', label: 'Inglese', help: 'Traduzione inglese → italiano.' },
          { value: 'it', label: 'Italiano', help: 'Solo trascrizione, senza traduzione.' },
        ]} />
      </section>
      {children}
      <section className="ui-sec">
        <h2>Prova tecnica del traduttore</h2>
        <p className="ui-muted">Misura sul tablet quali servizi rispondono, con e senza VPN, e se la registrazione resta udibile mentre il riconoscimento ascolta.</p>
        <div><a className="ui-btn" href="#prova"><Icon name="flask" /> Apri la prova tecnica</a></div>
      </section>
    </main>
  )
}
