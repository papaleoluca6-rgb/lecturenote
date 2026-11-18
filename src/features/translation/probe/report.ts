import { TRANSLATORS, providerLabel } from './config'
import type { ProbeLog } from './log'

// Tabelle dei risultati: le stesse righe sono mostrate in pagina e copiate come Markdown per la chat.

export interface Table {
  title: string
  note?: string
  head: string[]
  rows: string[][]
}

const time = (ms: number) => new Date(ms).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
const yn = (v: boolean) => (v ? 'sì' : 'no')
const esito = (ok: boolean | null) => (ok === true ? 'OK' : ok === false ? 'KO' : 'incerto')
const median = (xs: number[]) => {
  if (!xs.length) return '—'
  const s = [...xs].sort((a, b) => a - b)
  return String(s[Math.floor(s.length / 2)])
}

export function buildTables(log: ProbeLog): Table[] {
  const combos = new Map<string, { vpn: boolean; stt: string; tr: string; rec: number[]; trMs: number[]; tot: number[]; err: number }>()
  for (const p of log.phrases) {
    for (const { id } of TRANSLATORS) {
      const r = p.tr[id]
      if (!r) continue
      const key = `${p.vpn}|${p.stt}|${id}`
      const c = combos.get(key) ?? { vpn: p.vpn, stt: p.stt, tr: providerLabel(id), rec: [], trMs: [], tot: [], err: 0 }
      c.rec.push(p.recMs)
      if (r.error || r.ms === undefined) c.err++
      else {
        c.trMs.push(r.ms)
        c.tot.push(p.recMs + r.ms)
      }
      combos.set(key, c)
    }
  }
  return [
    {
      title: 'Connessione ai servizi',
      head: ['Quando', 'VPN', 'Servizio', 'Esito', 'ms', 'Dettaglio'],
      rows: log.conn.map((c) => [time(c.at), yn(c.vpn), c.target, esito(c.ok), String(c.ms), c.detail]),
    },
    {
      title: 'Web Speech + MediaRecorder insieme',
      note: 'Livello max < 0.01 = audio registrato muto.',
      head: ['Quando', 'VPN', 'Configurazione', 'Durata s', 'Chunk audio', 'Livello max', 'Frasi WS', 'Riavvii WS', 'Errori WS', 'Blocchi AI', 'Esito'],
      rows: log.sessions.map((s) => [
        time(s.at), yn(s.vpn), s.setup, String(s.sec), String(s.recChunks), String(s.levelMax),
        String(s.wsFinals), String(s.wsRestarts), s.wsErrors || '—', s.ai, s.verdict,
      ]),
    },
    {
      title: 'Ritardo per combinazione (mediana)',
      note: 'Riconoscimento: Web Speech = dal primo testo provvisorio alla frase finale; AI = dalla fine del blocco audio alla risposta (+ durata del blocco da aggiungere).',
      head: ['VPN', 'Riconoscimento', 'Traduttore', 'Frasi', 'Riconosc. ms', 'Traduz. ms', 'Totale ms', 'Errori traduz.'],
      rows: [...combos.values()].map((c) => [
        yn(c.vpn), c.stt, c.tr, String(c.rec.length), median(c.rec), median(c.trMs), median(c.tot), String(c.err),
      ]),
    },
    {
      title: 'Frasi riconosciute (ultime 30)',
      head: ['s', 'VPN', 'Riconoscimento', 'Lingua', 'Testo', 'Riconosc. ms', 'Traduzioni'],
      rows: log.phrases.slice(-30).map((p) => [
        String(p.at), yn(p.vpn), p.stt, p.lang, p.text, String(p.recMs),
        Object.entries(p.tr).map(([id, r]) => `${id} ${r.ms ?? '?'}ms: ${r.error ? `ERR ${r.error}` : r.text}`).join(' / '),
      ]),
    },
  ]
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ')

export function toMarkdown(tables: Table[]): string {
  const out = [`## Prova traduttore LectureNote (${time(Date.now())})`, `Dispositivo: ${navigator.userAgent}`]
  for (const t of tables) {
    out.push('', `### ${t.title}`)
    if (t.note) out.push(`_${t.note}_`)
    if (!t.rows.length) {
      out.push('(nessun dato)')
      continue
    }
    out.push(`| ${t.head.join(' | ')} |`, `|${t.head.map(() => '---').join('|')}|`)
    for (const r of t.rows) out.push(`| ${r.map(cell).join(' | ')} |`)
  }
  return out.join('\n')
}
