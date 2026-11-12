import { useId, useRef, useState } from 'react'
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

/**
 * The header's company and period: shown as plain text, changed in a modal dialog so the
 * selects don't crowd the header. Both selects apply at once; the dialog only hosts them.
 */
export function ContextSwitcher({ companies, companyId, onCompany, periods, periodId, onPeriod }: {
  companies: readonly { id: string; name: string }[]
  companyId: string
  onCompany: (id: string) => void
  periods: readonly FiscalPeriod[]
  periodId: string
  onPeriod: (id: string) => void
}) {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const company = companies.find((c) => c.id === companyId)
  const period = periods.find((p) => p.id === periodId)
  return (
    <div className="context-switcher">
      <p className="context-summary">
        <span className="context-company">{company?.name || 'Uden navn'}</span>
        {period && <span className="context-period">{period.name} <span className="context-range">({formatRange(period)})</span></span>}
      </p>
      <button type="button" className="link" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        Skift<span className="visually-hidden"> virksomhed eller periode</span>
      </button>
      <dialog ref={dialog} className="context-dialog" aria-labelledby={`${id}-title`} onClick={(e) => { if (e.target === dialog.current) dialog.current.close() }}>
        <form method="dialog">
          <h2 id={`${id}-title`}>Virksomhed og periode</h2>
          <div className="field">
            <label htmlFor={`${id}-company`}>Virksomhed</label>
            <select id={`${id}-company`} value={companyId} onChange={(e) => onCompany(e.target.value)}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name || 'Uden navn'}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-period`}>Periode</label>
            <select id={`${id}-period`} value={periodId} onChange={(e) => onPeriod(e.target.value)}>
              {[...sortPeriods(periods)].reverse().map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({formatRange(p)})</option>
              ))}
            </select>
          </div>
          <div className="dialog-actions">
            <button type="submit">Luk</button>
          </div>
        </form>
      </dialog>
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
