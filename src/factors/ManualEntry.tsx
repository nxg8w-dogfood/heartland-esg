import { useId, useState } from 'react'
import type { Factor } from '../data/factors'
import type { FactorSourceChoice } from '../calc/factorSources'
import { parseNumber } from '../calc/parseNumber'
import { formatFactor } from '../format'

/** A value for a factor from a source the user names, with the source's date. */
export function ManualEntry({ factor, initial, onSave, label = `Anden kilde for ${factor.name}` }: {
  factor: Factor
  /** Names the form for screen readers */
  label?: string
  initial: Extract<FactorSourceChoice, { kind: 'manual' }> | undefined
  onSave: (c: FactorSourceChoice) => void
}) {
  const id = useId()
  const [value, setValue] = useState(initial ? formatFactor(initial.value) : '')
  const [source, setSource] = useState(initial?.source ?? '')
  const [date, setDate] = useState(initial?.date ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(!!initial)

  function save(e: React.FormEvent) {
    e.preventDefault()
    const v = parseNumber(value)
    if (v === null || Number.isNaN(v)) return setError('Angiv værdien som et tal.')
    if (!source.trim()) return setError('Angiv, hvor værdien kommer fra.')
    setError(null)
    setSaved(true)
    onSave({ kind: 'manual', value: v, source: source.trim(), date })
  }

  const edited = () => setSaved(false)

  return (
    <form className="manual-entry" onSubmit={save} aria-label={label}>
      <label htmlFor={`${id}-v`}>Værdi ({factor.unit})</label>
      <input id={`${id}-v`} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => { setValue(e.target.value); edited() }} />
      <label htmlFor={`${id}-s`}>Kilde</label>
      <input id={`${id}-s`} autoComplete="off" placeholder="Fx leverandørens deklaration 2025" value={source} onChange={(e) => { setSource(e.target.value); edited() }} />
      <label htmlFor={`${id}-d`}>Kildens dato</label>
      <input id={`${id}-d`} type="date" value={date} onChange={(e) => { setDate(e.target.value); edited() }} />
      <button type="submit" className="secondary">Gem</button>
      {saved && !error && <span className="muted" role="status">Gemt</span>}
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  )
}
