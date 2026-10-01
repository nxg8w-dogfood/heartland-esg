import { useId, useState } from 'react'
import type { Factor } from '../data/factors'
import { parseNumber } from '../calc/parseNumber'
import { formatDate, formatFactor } from '../format'

type Props = {
  /** The factor table as shipped, before any entered values */
  base: readonly Factor[]
  entered: Record<string, number>
  onEnter: (id: string, value: number | null) => void
}

export function FactorsPage({ base, entered, onEnter }: Props) {
  const blank = base.filter((f) => f.value === null)
  const scopes = ['Scope 1', 'Scope 2', 'Scope 3'] as const
  return (
    <>
      <h1>Emissionsfaktorer</h1>
      <p className="lead">
        Faktortabellen fra det oprindelige klimaregnskab: {base.length} faktorer med kilde,
        enhed og gyldighed. Faktorer uden værdi må ikke gættes; indtast dem her, når en
        verificeret værdi foreligger.
      </p>

      <section aria-labelledby="pending-factors">
        <h2 id="pending-factors">Afventer indtastning ({blank.length})</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Faktor</th>
                <th scope="col">Kategori</th>
                <th scope="col">Enhed</th>
                <th scope="col">Værdi</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {blank.map((f) => (
                <tr key={f.id}>
                  <th scope="row">
                    {f.name}
                    <span className="sub">{f.region}</span>
                  </th>
                  <td>{f.scope} · {f.category}</td>
                  <td>{f.unit}</td>
                  <td><ValueInput factor={f} value={entered[f.id]} onEnter={(v) => onEnter(f.id, v)} /></td>
                  <td className="muted">{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {scopes.map((scope) => (
        <section key={scope} aria-labelledby={`factors-${scope}`}>
          <h2 id={`factors-${scope}`}>{scope}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Faktor</th>
                  <th scope="col">Kategori</th>
                  <th scope="col" className="num">Værdi</th>
                  <th scope="col">Enhed</th>
                  <th scope="col">Kilde</th>
                  <th scope="col">Gyldig</th>
                </tr>
              </thead>
              <tbody>
                {base.filter((f) => f.scope === scope).map((f) => {
                  const value = f.value ?? entered[f.id] ?? null
                  return (
                    <tr key={f.id}>
                      <th scope="row">
                        {f.name}
                        <span className="sub">{f.region}</span>
                      </th>
                      <td>{f.category}</td>
                      <td className="num">
                        {value === null ? <span className="pending">Afventer</span> : formatFactor(value)}
                        {f.value === null && value !== null && <span className="sub">Indtastet</span>}
                      </td>
                      <td>{f.unit}</td>
                      <td>{f.source}</td>
                      <td>{validity(f)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  )
}

function validity(f: Factor): string {
  if (f.validFrom && f.validTo) return `${formatDate(f.validFrom)} – ${formatDate(f.validTo)}`
  if (f.validFrom) return `fra ${formatDate(f.validFrom)}`
  if (f.validTo) return `til ${formatDate(f.validTo)}`
  return '—'
}

function ValueInput({ factor, value, onEnter }: { factor: Factor; value: number | undefined; onEnter: (v: number | null) => void }) {
  const id = useId()
  const [text, setText] = useState(value === undefined ? '' : formatFactor(value))
  const [error, setError] = useState<string | null>(null)

  function commit() {
    const v = parseNumber(text)
    if (v !== null && Number.isNaN(v)) {
      setError('Ikke et gyldigt tal.')
      return
    }
    setError(null)
    onEnter(v)
  }

  return (
    <div className="value-input">
      <label htmlFor={id} className="visually-hidden">Værdi for {factor.name} ({factor.unit})</label>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder="Afventer"
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
