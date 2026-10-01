import { useId } from 'react'
import type { Period } from './calc/dates'
import { formatNumber } from './format'

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
