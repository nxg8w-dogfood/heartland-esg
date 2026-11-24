import { useState } from 'react'
import type { Factor } from '../data/factors'
import { isMunicipalityGrid } from '../data/municipalityGridFactors'
import type { FactorSourceChoice, FactorSources } from '../calc/factorSources'
import { formatDate, formatFactor } from '../format'
import { InfoTip } from '../ui'
import { ManualEntry } from './ManualEntry'

/**
 * The built-in factor table as shipped, and a value for each factor it has none for. A value
 * entered here is the factor's entered source ("Anden kilde"): saved with its source and date,
 * shown under Emissionsfaktorer, and used everywhere the factor is.
 */
export function BuiltinTablePage({ base, factors, sources, onChoose }: {
  /** The factor table as shipped */
  base: readonly Factor[]
  /** The factor table with each factor's chosen source applied */
  factors: readonly Factor[]
  sources: FactorSources
  onChoose: (id: string, choice: FactorSourceChoice) => void
}) {
  const applied = new Map(factors.map((f) => [f.id, f]))
  const empty = base.filter((f) => f.value === null)
  const stillEmpty = empty.filter((f) => applied.get(f.id)?.value == null).length
  const scopes = ['Scope 1', 'Scope 2', 'Scope 3'] as const
  // A scope's table is drawn once opened: the factors per municipality alone are hundreds.
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())

  return (
    <>
      <p className="lead">
        Den indbyggede faktortabel: {base.length} faktorer, {empty.length} uden værdi.{' '}
        <InfoTip label="Om værdier i den indbyggede tabel">
          En værdi, du angiver her, gemmes med kilde og dato som faktorens indtastede kilde og bruges
          overalt, hvor faktoren bruges. Den kan også ses og ændres under Emissionsfaktorer. Faktorer
          uden værdi må ikke gættes: angiv kun en værdi fra en kilde, du kan henvise til.
        </InfoTip>
      </p>

      <section aria-labelledby="builtin-empty">
        <h2 id="builtin-empty">Faktorer uden værdi</h2>
        <p className="muted" role="status">
          {empty.length === 0 ? 'Alle faktorer i tabellen har en værdi.' : stillEmpty === 0 ? `Alle ${empty.length} har fået en værdi fra en anden kilde.` : `${stillEmpty} af ${empty.length} afventer stadig en værdi.`}
        </p>
        {empty.length > 0 && (
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">Faktorer uden værdi i den indbyggede tabel</caption>
              <thead>
                <tr>
                  <th scope="col">Faktor</th>
                  <th scope="col">Kategori</th>
                  <th scope="col">Bruges nu</th>
                  <th scope="col">Angiv værdi</th>
                </tr>
              </thead>
              <tbody>
                {empty.map((f) => {
                  const now = applied.get(f.id) ?? f
                  const choice = sources[f.id]
                  return (
                    <tr key={f.id}>
                      <th scope="row">
                        {f.name}
                        {f.note && <> <InfoTip label={`Note om ${f.name}, ${f.region}`}>{f.note}</InfoTip></>}
                        <span className="sub">{f.region}</span>
                      </th>
                      <td>{f.scope} · {f.category}</td>
                      <td>
                        {now.value === null ? <span className="pending">Afventer</span> : <>{formatFactor(now.value)} {f.unit}</>}
                        {now.value !== null && <span className="sub">{choice?.kind === 'manual' ? `Indtastet: ${choice.source}${choice.date ? `, ${formatDate(choice.date)}` : ''}` : now.source}</span>}
                      </td>
                      <td>
                        <ManualEntry
                          key={choice?.kind === 'manual' ? `${choice.value}|${choice.source}|${choice.date}` : 'none'}
                          factor={f}
                          initial={choice?.kind === 'manual' ? choice : undefined}
                          onSave={(c) => onChoose(f.id, c)}
                          label={`Værdi for ${f.name}, ${f.region}`}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="builtin-all">
        <h2 id="builtin-all">Hele tabellen</h2>
        <p className="muted">Værdierne, som de følger med appen, før en publikation eller en indtastet kilde vælges.</p>
        <div className="folds">
          {scopes.map((scope) => {
            const list = base.filter((f) => f.scope === scope)
            const municipalities = list.filter(isMunicipalityGrid).length
            return (
              <details key={scope} className="fold" open={open.has(scope)} onToggle={(e) => { const isOpen = e.currentTarget.open; setOpen((o) => { const n = new Set(o); if (isOpen) n.add(scope); else n.delete(scope); return n }) }}>
                <summary>
                  <span className="fold-title">{scope}</span>
                  <span className="fold-count">
                    {list.length} faktorer{municipalities > 0 && `, heraf ${municipalities} pr. kommune`}
                    {list.some((f) => f.value === null) && <span className="pending">{list.filter((f) => f.value === null).length} uden værdi</span>}
                  </span>
                </summary>
                {open.has(scope) && (
                  <div className="table-wrap">
                    <table>
                      <caption className="visually-hidden">Den indbyggede tabel, {scope}</caption>
                      <thead>
                        <tr>
                          <th scope="col">Faktor</th>
                          <th scope="col">Kategori</th>
                          <th scope="col" className="num">Værdi</th>
                          <th scope="col">Enhed</th>
                          <th scope="col">Kilde</th>
                          <th scope="col" className="num">Faktorår</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((f) => (
                          <tr key={f.id}>
                            <th scope="row">{f.name}<span className="sub">{f.region}</span></th>
                            <td>{f.category}</td>
                            <td className="num">{f.value === null ? <span className="pending">Ingen værdi</span> : formatFactor(f.value)}</td>
                            <td>{f.unit}</td>
                            <td>{f.source}</td>
                            <td className="num">{f.priceYear ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </details>
            )
          })}
        </div>
      </section>
    </>
  )
}
