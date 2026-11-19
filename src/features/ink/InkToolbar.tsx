import { Icon, type IconName } from '../../lib/Icon'
import { removeStrokes, restoreStrokes, strokeKey } from './data'
import { HIGHLIGHTER_SIZE, SIZES } from './freehand'
import { TEXT_SIZES, getTool, inkSaved, setTool, useInkTool, type InkOp, type InkTool } from './toolStore'
import './ink.css'

const PEN_COLORS = ['--ink-black', '--ink-blue', '--ink-red', '--ink-green', '--ink-purple', '--ink-orange']
const HL_COLORS = ['--ink-hl-yellow', '--ink-hl-green', '--ink-hl-pink', '--ink-hl-blue']
const COLOR_NAME: Record<string, string> = {
  '--ink-black': 'nero',
  '--ink-blue': 'blu',
  '--ink-red': 'rosso',
  '--ink-green': 'verde',
  '--ink-purple': 'viola',
  '--ink-orange': 'arancione',
  '--ink-hl-yellow': 'giallo',
  '--ink-hl-green': 'verde',
  '--ink-hl-pink': 'rosa',
  '--ink-hl-blue': 'azzurro',
}
const TOOLS: { id: InkTool; icon: IconName; label: string; title: string }[] = [
  { id: 'pen', icon: 'pen', label: 'Penna', title: 'Penna' },
  { id: 'highlighter', icon: 'highlighter', label: 'Evidenziatore', title: 'Evidenziatore' },
  { id: 'text', icon: 'text', label: 'Testo', title: 'Testo: tocca la pagina per aggiungere una casella di testo' },
  { id: 'eraser', icon: 'eraser', label: 'Gomma', title: 'Gomma (cancella tratti interi). Con la penna, tieni premuto il tasto della S Pen per cancellare al volo' },
]

/** Ultimo spessore della penna: l'evidenziatore ha il suo, tornando alla penna si riprende questo. */
let penSize: number = SIZES.medio

function pickTool(tool: InkTool) {
  const t = getTool()
  if (tool === 'pen' || tool === 'text') setTool({ tool, color: t.penColor, size: penSize })
  else if (tool === 'highlighter') setTool({ tool, color: t.hlColor, size: HIGHLIGHTER_SIZE })
  else setTool({ tool })
}

function pickColor(color: string) {
  setTool(getTool().tool === 'highlighter' ? { color, hlColor: color } : { color, penColor: color })
}

/** Applica un'azione (`forward`) o il suo contrario: aggiungere o togliere quei tratti. */
function apply(op: InkOp, forward: boolean) {
  const add = (op.kind === 'add') === forward
  return add ? restoreStrokes(op.pageId, op.strokes) : removeStrokes(op.pageId, new Set(op.strokes.map(strokeKey)))
}

/** «Annulla» disfa l'ultima azione, che sia un tratto o una cancellazione con la gomma. */
async function undo() {
  const { undo: stack, redo } = getTool()
  const op = stack.at(-1)
  if (!op) return
  setTool({ undo: stack.slice(0, -1), redo: [...redo, op] })
  await apply(op, false).then(() => inkSaved(), inkSaved)
}

async function redo() {
  const { undo: stack, redo } = getTool()
  const op = redo.at(-1)
  if (!op) return
  setTool({ redo: redo.slice(0, -1), undo: [...stack, op] })
  await apply(op, true).then(() => inkSaved(), inkSaved)
}

/** Strumenti della penna, condivisi da slide e pagine bianche: colonna a sinistra in orizzontale, riga in verticale. */
export function InkToolbar({ focus, onFocus }: { focus: boolean; onFocus: () => void }) {
  const t = useInkTool()
  const colors = t.tool === 'highlighter' ? HL_COLORS : t.tool === 'pen' || t.tool === 'text' ? PEN_COLORS : []
  const fingerLabel = t.fingerDraws ? 'Il dito scrive' : 'Il dito sfoglia'

  return (
    <div className="ink-bar" role="toolbar" aria-label="Strumenti penna">
      {t.saveError && <p className="ink-err" role="alert">{t.saveError}</p>}
      {TOOLS.map((x) => (
        <button key={x.id} className="ui-btn icon-only ink-btn" aria-pressed={t.tool === x.id} aria-label={x.label} title={x.id === 'pen' && t.penSeen ? 'Penna (S Pen rilevata: il dito sfoglia, il palmo viene ignorato)' : x.title} onClick={() => pickTool(x.id)}>
          <Icon name={x.icon} />
          {/* Segnale discreto: la S Pen è stata rilevata (il dito ora sfoglia, il palmo viene ignorato). */}
          {x.id === 'pen' && t.penSeen && <span className="ink-pen-dot" aria-hidden />}
        </button>
      ))}
      <button
        className="ui-btn icon-only ink-btn"
        aria-pressed={t.fingerDraws}
        aria-label={fingerLabel}
        title={t.fingerDraws ? 'Il dito scrive: tocca perché il dito sfogli e faccia zoom' : 'Il dito sfoglia e fa zoom, scrive solo la penna: tocca per scrivere anche col dito'}
        onClick={() => setTool({ fingerDraws: !t.fingerDraws })}
      >
        <Icon name="hand" />
      </button>

      {colors.length > 0 && <span className="ink-sep" aria-hidden />}
      {colors.map((c) => (
        <button key={c} className="ui-btn icon-only ink-btn ink-sw" aria-pressed={t.color === c} aria-label={`Colore ${COLOR_NAME[c]}`} title={`Colore ${COLOR_NAME[c]}`} onClick={() => pickColor(c)}>
          <span className="ink-swatch" style={{ background: `var(${c})` }} />
        </button>
      ))}

      {t.tool === 'pen' && <span className="ink-sep" aria-hidden />}
      {t.tool === 'pen' &&
        Object.entries(SIZES).map(([name, size]) => (
          <button
            key={name}
            className="ui-btn icon-only ink-btn"
            aria-pressed={t.size === size}
            aria-label={`Tratto ${name}`}
            title={`Tratto ${name}`}
            onClick={() => {
              penSize = size
              setTool({ size })
            }}
          >
            <span className="ink-dot" style={{ width: size * 1.6 + 2, height: size * 1.6 + 2 }} />
          </button>
        ))}

      {t.tool === 'text' && <span className="ink-sep" aria-hidden />}
      {t.tool === 'text' &&
        Object.entries(TEXT_SIZES).map(([name, size]) => (
          <button key={name} className="ui-btn icon-only ink-btn" aria-pressed={t.textSize === size} aria-label={`Testo ${name}`} title={`Testo ${name}`} onClick={() => setTool({ textSize: size })}>
            <span className="ink-aa" style={{ fontSize: size * 600 }}>A</span>
          </button>
        ))}

      <span className="ink-sep" aria-hidden />
      <button className="ui-btn icon-only ink-btn" disabled={!t.undo.length} aria-label="Annulla" title="Annulla l’ultima azione (tratto o cancellazione)" onClick={() => void undo()}>
        <Icon name="undo" />
      </button>
      <button className="ui-btn icon-only ink-btn" disabled={!t.redo.length} aria-label="Ripeti" title="Ripeti l’azione annullata" onClick={() => void redo()}>
        <Icon name="redo" />
      </button>

      <span className="ink-sep" aria-hidden />
      <button
        className="ui-btn icon-only ink-btn"
        aria-pressed={focus}
        aria-label={focus ? 'Esci dalla modalità foglio' : 'Modalità foglio'}
        title={focus ? 'Esci dalla modalità foglio' : 'Modalità foglio: la pagina occupa tutto lo schermo'}
        onClick={onFocus}
      >
        <Icon name={focus ? 'shrink' : 'expand'} />
      </button>
    </div>
  )
}
