import { useId, useState } from 'react'
import type { Period } from './calc/dates'
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

export function PeriodPicker({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const id = useId()
  const invalid = period.end < period.start
  return (
    <fieldset className="period">
      <legend>Periode</legend>
      <label htmlFor={`${id}-start`}>Fra</label>
      <input id={`${id}-start`} type="date" value={period.start} onChange={(e) => onChange({ ...period, start: e.target.value })} />
      <label htmlFor={`${id}-end`}>Til</label>
      <input
        id={`${id}-end`}
        type="date"
        value={period.end}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-err` : undefined}
        onChange={(e) => onChange({ ...period, end: e.target.value })}
      />
      {invalid && (
        <p id={`${id}-err`} className="error">
          Slutdatoen ligger før startdatoen, så ingen linjer tæller med.
        </p>
      )}
    </fieldset>
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
