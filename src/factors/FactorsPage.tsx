import { useId, useState } from 'react'
import type { Factor } from '../data/factors'
import type { FactorPublication } from '../data/factorPublications'
import { apiProviders, sourceOptions, type FactorSourceChoice, type FactorSources } from '../calc/factorSources'
import { parseNumber } from '../calc/parseNumber'
import { formatDate, formatFactor } from '../format'

type Props = {
  /** The factor table as shipped */
  base: readonly Factor[]
  /** The factor table with each factor's chosen source applied */
  factors: readonly Factor[]
  publications: readonly FactorPublication[]
  sources: FactorSources
  onChoose: (id: string, choice: FactorSourceChoice) => void
}

export function FactorsPage({ base, factors, publications, sources, onChoose }: Props) {
  const pending = factors.filter((f) => f.value === null)
  const scopes = ['Scope 1', 'Scope 2', 'Scope 3'] as const
  return (
    <>
      <h1>Emissionsfaktorer</h1>
      <p className="lead">
        Faktortabellen fra det oprindelige klimaregnskab: {base.length} faktorer med kilde,
        enhed og gyldighed. For hver faktor vælger du, hvor værdien kommer fra: den indbyggede
        tabel, en officiel publikation, et API eller en anden kilde, du angiver selv. Valget
        gemmes med kilde og dato. Faktorer uden værdi må ikke gættes.
      </p>

      <section aria-labelledby="api-sources">
        <h2 id="api-sources">API-kilder</h2>
        <ul>
          {apiProviders.map((a) => (
            <li key={a.id}>
              <strong>{a.name}:</strong> {a.unavailable ? <>ikke tilgængelig endnu. {a.unavailable}</> : 'tilgængelig.'}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="pending-factors">
        <h2 id="pending-factors">Afventer en kilde ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="muted">Alle faktorer har en værdi.</p>
        ) : (
          <ul>
            {pending.map((f) => (
              <li key={f.id}>
                <a href={`#factor-${f.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`factor-${f.id}`)?.scrollIntoView() }}>
                  {f.name}
                </a>{' '}
                <span className="muted">({f.region}{f.note ? `. ${f.note}` : ''})</span>
              </li>
            ))}
          </ul>
        )}
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
                  const applied = factors.find((x) => x.id === f.id) ?? f
                  return (
                    <tr key={f.id} id={`factor-${f.id}`}>
                      <th scope="row">
                        {f.name}
                        <span className="sub">{f.region}</span>
                      </th>
                      <td>{f.category}</td>
                      <td className="num">
                        {applied.value === null ? <span className="pending">Afventer</span> : formatFactor(applied.value)}
                      </td>
                      <td>{f.unit}</td>
                      <td>
                        <SourcePicker factor={f} publications={publications} choice={sources[f.id]} onChoose={(c) => onChoose(f.id, c)} />
                        <span className="sub">{applied.source}{applied.reference && applied.reference !== f.reference ? ` · ${applied.reference}` : ''}</span>
                      </td>
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

const optionKey = (c: FactorSourceChoice | undefined): string =>
  !c || c.kind === 'builtin' ? 'builtin'
    : c.kind === 'publication' ? `publication:${c.publicationId}`
      : c.kind === 'api' ? `api:${c.providerId}`
        : 'manual'

function SourcePicker({ factor, publications, choice, onChoose }: {
  factor: Factor
  publications: readonly FactorPublication[]
  choice: FactorSourceChoice | undefined
  onChoose: (c: FactorSourceChoice) => void
}) {
  const id = useId()
  const [selected, setSelected] = useState(optionKey(choice))
  const options = sourceOptions(factor, publications)

  function change(key: string) {
    setSelected(key)
    if (key === 'builtin') onChoose({ kind: 'builtin' })
    else if (key.startsWith('publication:')) onChoose({ kind: 'publication', publicationId: key.slice('publication:'.length) })
    // Manual needs a value first; API providers can't be chosen yet.
  }

  return (
    <div className="source-picker">
      <label htmlFor={id} className="visually-hidden">Kilde for {factor.name}</label>
      <select id={id} value={selected} onChange={(e) => change(e.target.value)}>
        {options.map((o) => {
          if (o.kind === 'builtin') return <option key="builtin" value="builtin">{o.value === null ? 'Indbygget tabel (ingen værdi)' : 'Indbygget tabel'}</option>
          if (o.kind === 'publication') return <option key={o.publication.id} value={`publication:${o.publication.id}`}>{o.label}</option>
          if (o.kind === 'manual') return <option key="manual" value="manual">{o.label}</option>
          return <option key={o.provider.id} value={`api:${o.provider.id}`} disabled={!!o.provider.unavailable}>{o.label}{o.provider.unavailable ? ' (ikke tilgængelig)' : ''}</option>
        })}
      </select>
      {selected === 'manual' && (
        <ManualEntry factor={factor} initial={choice?.kind === 'manual' ? choice : undefined} onSave={onChoose} />
      )}
    </div>
  )
}

function ManualEntry({ factor, initial, onSave }: {
  factor: Factor
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
    <form className="manual-entry" onSubmit={save} aria-label={`Anden kilde for ${factor.name}`}>
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
