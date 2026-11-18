import { HIGHLIGHTER_SIZE, SIZES } from './freehand'
import { undoLast } from './data'
import { setTool, useInkTool, type InkTool } from './toolStore'
import './ink.css'

const PEN_COLORS = ['--ink-black', '--ink-blue', '--ink-red', '--ink-green']
const HL_COLORS = ['--ink-hl-yellow', '--ink-hl-green']
const COLOR_NAME: Record<string, string> = {
  '--ink-black': 'nero',
  '--ink-blue': 'blu',
  '--ink-red': 'rosso',
  '--ink-green': 'verde',
  '--ink-hl-yellow': 'giallo',
  '--ink-hl-green': 'verde chiaro',
}

/** Strumenti della penna, condivisi da slide e pagine bianche. */
export function InkToolbar() {
  const t = useInkTool()
  const pick = (tool: InkTool, color?: string) =>
    setTool({ tool, ...(color ? { color } : {}), ...(tool === 'highlighter' ? { size: HIGHLIGHTER_SIZE } : tool === 'pen' && t.tool !== 'pen' ? { size: SIZES.medio } : {}) })
  const colors = t.tool === 'highlighter' ? HL_COLORS : PEN_COLORS

  return (
    <div className="ink-bar" role="toolbar" aria-label="Strumenti penna">
      <button className={`ink-btn${t.tool === 'pen' ? ' on' : ''}`} onClick={() => pick('pen', PEN_COLORS.includes(t.color) ? undefined : PEN_COLORS[0])}>✎ Penna</button>
      <button className={`ink-btn${t.tool === 'highlighter' ? ' on' : ''}`} onClick={() => pick('highlighter', HL_COLORS.includes(t.color) ? undefined : HL_COLORS[0])}>▮ Evidenziatore</button>
      <button className={`ink-btn${t.tool === 'eraser' ? ' on' : ''}`} onClick={() => pick('eraser')}>⌫ Gomma</button>
      {t.tool !== 'eraser' && (
        <>
          <span className="ink-sep" aria-hidden />
          {colors.map((c) => (
            <button key={c} className={`ink-btn${t.color === c ? ' on' : ''}`} onClick={() => setTool({ color: c })} aria-label={`Colore ${COLOR_NAME[c]}`}>
              <span className="ink-swatch" style={{ background: `var(${c})` }} />
            </button>
          ))}
        </>
      )}
      {t.tool === 'pen' && (
        <>
          <span className="ink-sep" aria-hidden />
          {Object.entries(SIZES).map(([name, size]) => (
            <button key={name} className={`ink-btn${t.size === size ? ' on' : ''}`} onClick={() => setTool({ size })} aria-label={`Tratto ${name}`}>
              <span className="ink-dot" style={{ width: size * 1.6 + 2, height: size * 1.6 + 2 }} />
            </button>
          ))}
        </>
      )}
      <span className="ink-sep" aria-hidden />
      <button className="ink-btn" disabled={!t.lastPageId} onClick={() => t.lastPageId && void undoLast(t.lastPageId)}>↶ Annulla</button>
      <button
        className={`ink-btn${t.fingerDraws ? ' on' : ''}`}
        onClick={() => setTool({ fingerDraws: !t.fingerDraws })}
        aria-pressed={t.fingerDraws}
        title="Spento: il dito sfoglia e fa zoom, scrive solo la penna"
      >
        {t.fingerDraws ? '☝ Il dito scrive' : '☝ Il dito sfoglia'}
      </button>
    </div>
  )
}
