// Funzioni di Chrome che girano sul tablet, senza AI esterne né rete (dopo aver scaricato il modello):
// Translator API (zh/en → it), LanguageDetector API e riconoscimento vocale sul dispositivo.
// Sono API recenti: ogni funzione controlla se esistono e restituisce uno stato leggibile.

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available'
interface Monitor { addEventListener(t: 'downloadprogress', f: (e: { loaded: number }) => void): void }
interface TranslatorInst { translate(text: string): Promise<string> }
interface TranslatorStatic {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>
  create(o: { sourceLanguage: string; targetLanguage: string; monitor?: (m: Monitor) => void }): Promise<TranslatorInst>
}
interface DetectorInst { detect(text: string): Promise<{ detectedLanguage: string; confidence: number }[]> }
interface DetectorStatic {
  availability(): Promise<Availability>
  create(o?: { monitor?: (m: Monitor) => void }): Promise<DetectorInst>
}
type SRStatic = {
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<Availability>
  install?: (o: { langs: string[]; processLocally: boolean }) => Promise<boolean>
}

const g = globalThis as unknown as {
  Translator?: TranslatorStatic
  LanguageDetector?: DetectorStatic
  SpeechRecognition?: SRStatic
  webkitSpeechRecognition?: SRStatic
}

export const AVAIL_TEXT: Record<Availability, string> = {
  unavailable: 'non disponibile su questo dispositivo',
  downloadable: 'disponibile, modello da scaricare',
  downloading: 'modello in scaricamento',
  available: 'pronto (offline)',
}

/** Alcune build di Chrome non rispondono mai: meglio un errore chiaro che un'attesa infinita. */
export function withTimeout<T>(p: Promise<T>, sec: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what}: nessuna risposta in ${sec} s`)), sec * 1000)),
  ])
}

const translators = new Map<string, Promise<TranslatorInst>>()

/** Stato della traduzione offline per una coppia di lingue (es. zh → it). */
export async function translatorAvailability(from: 'zh' | 'en'): Promise<Availability | 'no-api'> {
  if (!g.Translator) return 'no-api'
  return withTimeout(g.Translator.availability({ sourceLanguage: from, targetLanguage: 'it' }), 15, 'Controllo disponibilità')
}

/** Crea (e se serve scarica) il traduttore. Il primo scaricamento va avviato da un tocco dell'utente. */
export function getTranslator(from: 'zh' | 'en', onProgress?: (pct: number) => void): Promise<TranslatorInst> {
  const T = g.Translator
  if (!T) return Promise.reject(new Error("Traduzione offline di Chrome non disponibile su questo dispositivo (su Android non c'è): scegli un'altra traduzione"))
  let p = translators.get(from)
  if (!p) {
    p = T.create({
      sourceLanguage: from,
      targetLanguage: 'it',
      monitor: (m) => m.addEventListener('downloadprogress', (e) => onProgress?.(Math.round(e.loaded * 100))),
    })
    p.catch(() => translators.delete(from))
    translators.set(from, p)
  }
  return p
}

export async function translateOnDevice(text: string, from: 'zh' | 'en'): Promise<string> {
  const t = await withTimeout(getTranslator(from), 60, 'Traduttore Chrome non pronto (premi prima «Testa Chrome offline»)')
  return withTimeout(t.translate(text), 30, 'Traduzione Chrome')
}

let detector: Promise<DetectorInst> | null = null

/** Lingua del testo con il rilevatore offline di Chrome (null se l'API non c'è). */
export async function detectOnDevice(text: string): Promise<{ lang: string; confidence: number } | null> {
  if (!g.LanguageDetector) return null
  detector ??= g.LanguageDetector.create()
  const [top] = await (await detector).detect(text)
  return top ? { lang: top.detectedLanguage, confidence: Math.round(top.confidence * 100) / 100 } : null
}

export async function detectorAvailability(): Promise<Availability | 'no-api'> {
  return g.LanguageDetector ? withTimeout(g.LanguageDetector.availability(), 15, 'Controllo disponibilità') : 'no-api'
}

/** Riconoscimento vocale sul dispositivo (senza server Google): stato e installazione del pacchetto lingua. */
export async function localSpeech(lang: string, install: boolean): Promise<Availability | 'no-api'> {
  const SR = g.SpeechRecognition ?? g.webkitSpeechRecognition
  if (!SR?.available) return 'no-api'
  const o = { langs: [lang], processLocally: true }
  const a = await withTimeout(SR.available(o), 15, 'Controllo disponibilità')
  if (install && a === 'downloadable' && SR.install) return (await withTimeout(SR.install(o), 300, 'Installazione pacchetto lingua')) ? 'available' : a
  return a
}
