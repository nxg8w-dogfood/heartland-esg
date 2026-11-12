import { useId, useState } from 'react'
import { nextPeriod, periodError, sortPeriods, type FiscalPeriod } from '../calc/periods'
import { newId } from '../newId'

/**
 * A company's fiscal periods (docs/adr/0013). A change is kept only when the period is valid
 * among the others: a unique name, a start before the end, and no overlap. Until then the row
 * shows what's wrong and the saved period is unchanged.
 */
export function PeriodsEditor({ companyName, periods, onChange }: { companyName: string; periods: FiscalPeriod[]; onChange: (p: FiscalPeriod[]) => void }) {
  const id = useId()
  const sorted = sortPeriods(periods)
  return (
    <div className="periods-editor">
      <h3 id={`${id}-h`}>Regnskabsperioder</h3>
      <p className="muted">
        Vælg perioden øverst ved siden af virksomheden. Linjerne har deres egne datoer, og perioden
        afgør kun, hvilke dage der tæller med, så en periode kan slettes uden at slette data.
      </p>
      <table className="periods" aria-labelledby={`${id}-h`}>
        <thead>
          <tr>
            <th scope="col">Navn</th>
            <th scope="col">Startdato</th>
            <th scope="col">Slutdato</th>
            <th scope="col"><span className="visually-hidden">Handling</span></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <PeriodRow
              key={p.id}
              period={p}
              others={sorted}
              companyName={companyName}
              onChange={(next) => onChange(sorted.map((x) => (x.id === p.id ? next : x)))}
              onRemove={sorted.length > 1 ? () => onChange(sorted.filter((x) => x.id !== p.id)) : undefined}
            />
          ))}
        </tbody>
      </table>
      <div className="databar-actions">
        <button type="button" className="secondary" onClick={() => onChange([...sorted, nextPeriod(newId(), sorted)])}>
          Tilføj periode
        </button>
      </div>
    </div>
  )
}

function PeriodRow({ period, others, companyName, onChange, onRemove }: {
  period: FiscalPeriod
  others: FiscalPeriod[]
  companyName: string
  onChange: (p: FiscalPeriod) => void
  onRemove?: () => void
}) {
  const id = useId()
  const [draft, setDraft] = useState(period)
  const [error, setError] = useState<string | null>(null)
  function commit(next = draft) {
    const candidate = { ...next, name: next.name.trim() }
    const e = periodError(candidate, others)
    setError(e)
    if (e) return
    if (candidate.name !== period.name || candidate.start !== period.start || candidate.end !== period.end) onChange(candidate)
  }
  const field = (key: 'name' | 'start' | 'end', label: string, type: 'text' | 'date') => (
    <>
      <label htmlFor={`${id}-${key}`} className="visually-hidden">{label}, {period.name}, {companyName}</label>
      <input
        id={`${id}-${key}`}
        type={type}
        className={key === 'name' ? 'period-name' : undefined}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        onBlur={() => commit()}
        onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
      />
    </>
  )
  return (
    <>
      <tr>
        <td>{field('name', 'Navn', 'text')}</td>
        <td>{field('start', 'Startdato', 'date')}</td>
        <td>{field('end', 'Slutdato', 'date')}</td>
        <td>
          {onRemove && (
            <button type="button" className="link" onClick={onRemove}>
              Slet<span className="visually-hidden"> perioden {period.name}</span>
            </button>
          )}
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={4}><p id={`${id}-err`} className="error" role="alert">{error}</p></td>
        </tr>
      )}
    </>
  )
}
