export interface Choice<V extends string> {
  value: V
  label: string
  help: string
  disabled?: boolean
  /** Perché non si può scegliere (default: manca la chiave). */
  offNote?: string
}

export function ChoiceGroup<V extends string>({ name, label, value, choices, onChange }: {
  name: string
  label: string
  value: V
  choices: Choice<V>[]
  onChange: (v: V) => void
}) {
  return (
    <div className="set-choices" role="radiogroup" aria-label={label}>
      {choices.map((c) => (
        <label key={c.value} className={`set-choice${c.disabled ? ' off' : ''}`}>
          <input type="radio" name={name} checked={value === c.value} disabled={c.disabled} onChange={() => onChange(c.value)} />
          <span>
            <strong>{c.label}</strong>
            <small>{c.help}{c.disabled ? ` — ${c.offNote ?? 'richiede una chiave'}` : ''}</small>
          </span>
        </label>
      ))}
    </div>
  )
}
