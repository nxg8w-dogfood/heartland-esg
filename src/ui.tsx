import { useId, useState } from 'react'
import { formatRange, sortPeriods, type FiscalPeriod } from './calc/periods'
import { parseNumber } from './calc/parseNumber'
import { formatFactor, formatNumber } from './format'

export function Tile({
  label,
  value,
  unit = 'tCO2e',
  decimals = 3,
  accent,
  note,
}: {
  label: string
  value: number
  unit?: string
  decimals?: number
  accent?: boolean
  note?: string
}) {
  return (
    <div className={accent ? 'tile accent' : 'tile'}>
      <dt>{label}</dt>
      <dd>
        {formatNumber(value, decimals)} <span className="unit">{unit}</span>
        {note && <span className="sub">{note}</span>}
      </dd>
    </div>
  )
}

/** The header's period picker: the active company's periods, latest first. */
export function PeriodSelect({ periods, value, onChange }: { periods: readonly FiscalPeriod[]; value: string; onChange: (id: string) => void }) {
  const id = useId()
  return (
    <div className="company-picker">
      <label htmlFor={id}>Periode</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {[...sortPeriods(periods)].reverse().map((p) => (
          <option key={p.id} value={p.id}>{p.name} ({formatRange(p)})</option>
        ))}
      </select>
    </div>
  )
}

/** A number input that reads Danish formats and commits on blur or Enter. */
export function NumberField({ label, hint, value, onCommit, hideLabel, placeholder }: {
  label: string
  hint?: string
  value: number | null
  onCommit: (v: number | null) => void
  hideLabel?: boolean
  placeholder?: string
}) {
  const id = useId()
  const [text, setText] = useState(value === null ? '' : formatFactor(value))
  const [error, setError] = useState<string | null>(null)
  function commit() {
    const v = parseNumber(text)
    if (v !== null && (Number.isNaN(v) || v < 0)) {
      setError(Number.isNaN(v) ? 'Ikke et gyldigt tal.' : 'Kan ikke være negativ.')
      return
    }
    setError(null)
    onCommit(v)
  }
  return (
    <div className={hideLabel ? 'value-input' : 'field'}>
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : undefined}>
        {label}{hint && <span className="optional"> ({hint})</span>}
      </label>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      {error && <p id={`${id}-err`} className="error">{error}</p>}
    </div>
  )
}
