export interface Choice<V extends string> {
  value: V
  label: string
  help: string
  disabled?: boolean
}

export function ChoiceGroup<V extends string>({ name, value, choices, onChange }: {
  name: string
  value: V
  choices: Choice<V>[]
  onChange: (v: V) => void
}) {
  return (
    <div className="set-choices" role="radiogroup">
      {choices.map((c) => (
        <label key={c.value} className={`set-choice${c.disabled ? ' off' : ''}`}>
          <input type="radio" name={name} checked={value === c.value} disabled={c.disabled} onChange={() => onChange(c.value)} />
          <span>
            <strong>{c.label}</strong>
            <small>{c.help}{c.disabled ? ' — richiede una chiave' : ''}</small>
          </span>
        </label>
      ))}
    </div>
  )
}
