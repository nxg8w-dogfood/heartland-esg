import { useCallback, useId, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { applyFactorSources } from '../calc/factorSources'
import {
  dataYears, factorSourceDifferences, groupSummary, locationTotal, marketTotal, yearOverYear, type Totals,
} from '../calc/groupSummary'
import { parseNumber } from '../calc/parseNumber'
import { factorPublications } from '../data/factorPublications'
import { factors as baseFactors } from '../data/factors'
import { formatNumber } from '../format'
import { newCompany, type Company, type GroupData, type OwnershipShare } from '../storage/group'
import { PeriodPicker, Tile } from '../ui'

type Props = { group: GroupData; setGroup: Dispatch<SetStateAction<GroupData>> }

const t = (v: number) => formatNumber(v, 3)
/** Year-over-year shows at most this many of the latest years with data */
const MAX_YEARS = 10

export function GroupPage({ group, setGroup }: Props) {
  const groupNameId = useId()
  const [newName, setNewName] = useState('')

  // Each company is calculated with its own factor sources.
  const factorsById = useMemo(
    () => new Map(group.companies.map((c) => [c.id, applyFactorSources(baseFactors, c.account.factorSources, factorPublications)])),
    [group.companies],
  )
  const factorsFor = useCallback((c: Company) => factorsById.get(c.id) ?? baseFactors, [factorsById])
  const summary = useMemo(() => groupSummary(group, factorsFor, group.summaryPeriod), [group, factorsFor])
  const allYears = useMemo(() => dataYears(group), [group])
  const years = allYears.slice(-MAX_YEARS)
  const yoy = useMemo(() => yearOverYear(group, factorsFor, allYears.slice(-MAX_YEARS)), [group, factorsFor, allYears])
  const differences = useMemo(() => factorSourceDifferences(group, baseFactors), [group])

  const updateCompany = (id: string, patch: Partial<Company>) =>
    setGroup((g) => ({ ...g, companies: g.companies.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))

  function addCompany(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const company = newCompany(name)
    setGroup((g) => ({ ...g, companies: [...g.companies, company] }))
    setNewName('')
  }

  function removeCompany(c: Company) {
    if (!window.confirm(`Slet ${c.name || 'virksomheden'} og hele dens klimaregnskab? Det kan ikke fortrydes — eksportér en backup først, hvis du er i tvivl.`)) return
    setGroup((g) => {
      const companies = g.companies.filter((x) => x.id !== c.id)
      return { ...g, companies, activeCompanyId: g.activeCompanyId === c.id ? companies[0].id : g.activeCompanyId }
    })
  }

  // A link to the company's Scope 1 page, which also makes it the active company.
  const openCompany = (c: Company) => setGroup((g) => ({ ...g, activeCompanyId: c.id }))

  const issueCount = summary.companies.reduce((n, c) => n + c.issues.length, 0) + differences.length

  return (
    <>
      <h1>Koncern</h1>
      <p className="lead">
        Koncernens klimaregnskab efter <strong>ejerandelsmetoden</strong> (GHG-protokollen, equity
        share): hver virksomhed tæller med koncernens ejerandel i den for hvert kalenderår. Hver
        virksomhed har sit eget klimaregnskab og sine egne faktorkilder.
      </p>

      <div className="field">
        <label htmlFor={groupNameId}>Koncernens navn</label>
        <input id={groupNameId} value={group.name} onChange={(e) => setGroup((g) => ({ ...g, name: e.target.value }))} />
      </div>

      <PeriodPicker period={group.summaryPeriod} onChange={(summaryPeriod) => setGroup((g) => ({ ...g, summaryPeriod }))} />

      <section aria-labelledby="group-totals">
        <h2 id="group-totals" className="visually-hidden">Koncernens totaler</h2>
        <dl className="tiles" aria-live="polite">
          <Tile label="Koncernen i alt, market-based" value={marketTotal(summary.total)} accent note={issueCount ? `Ufuldstændig — ${issueCount} forhold nedenfor` : undefined} />
          <Tile label="Koncernen i alt, location-based" value={locationTotal(summary.total)} />
          <Tile label="Scope 1" value={summary.total.scope1} />
          <Tile label="Scope 2, market-based" value={summary.total.scope2Market} />
          <Tile label="Scope 3" value={summary.total.scope3} />
        </dl>
      </section>

      <section aria-labelledby="group-companies">
        <h2 id="group-companies">Virksomheder</h2>
        <p className="muted">Tal i tCO2e for perioden, efter koncernens ejerandel. Kolonnen 100 % viser virksomhedens egne tal.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Virksomhed</th>
                <th scope="col">Ejerandel</th>
                <th scope="col" className="num">Scope 1</th>
                <th scope="col" className="num">Scope 2 location</th>
                <th scope="col" className="num">Scope 2 market</th>
                <th scope="col" className="num">Scope 3</th>
                <th scope="col" className="num">I alt (market)</th>
                <th scope="col" className="num">100 % (market)</th>
              </tr>
            </thead>
            <tbody>
              {summary.companies.map((s) => (
                <tr key={s.company.id}>
                  <th scope="row">
                    <a href="#/scope1" onClick={() => openCompany(s.company)}>{s.company.name || 'Uden navn'}</a>
                  </th>
                  <td>{ownershipText(s.ownership)}</td>
                  <TotalsCells totals={s.share} />
                  <td className="num">{t(marketTotal(s.share))}</td>
                  <td className="num muted">{t(marketTotal(s.full))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Koncernen</th>
                <td />
                <TotalsCells totals={summary.total} />
                <td className="num"><strong>{t(marketTotal(summary.total))}</strong></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section aria-labelledby="group-yoy">
        <h2 id="group-yoy">År for år</h2>
        {years.length === 0 ? (
          <p className="muted">Ingen data endnu.</p>
        ) : (
          <>
            <p className="muted">Market-based i alt pr. kalenderår, efter ejerandel{allYears.length > MAX_YEARS ? `, de seneste ${MAX_YEARS} år med data` : ''}.</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">År</th>
                    {group.companies.map((c) => <th key={c.id} scope="col" className="num">{c.name || 'Uden navn'}</th>)}
                    <th scope="col" className="num">Koncernen</th>
                    <th scope="col" className="num">Ændring</th>
                  </tr>
                </thead>
                <tbody>
                  {yoy.map(({ year, summary: s }, i) => {
                    const total = marketTotal(s.total)
                    const prev = i > 0 ? marketTotal(yoy[i - 1].summary.total) : null
                    return (
                      <tr key={year}>
                        <th scope="row">{year}</th>
                        {s.companies.map((c) => <td key={c.company.id} className="num">{t(marketTotal(c.share))}</td>)}
                        <td className="num"><strong>{t(total)}</strong></td>
                        <td className="num">{prev ? `${total >= prev ? '+' : ''}${formatNumber(((total - prev) / prev) * 100, 1)} %` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="group-completeness">
        <h2 id="group-completeness">Fuldstændighed</h2>
        {issueCount === 0 ? (
          <p>Ingen mangler fundet for perioden.</p>
        ) : (
          <>
            {summary.companies.filter((s) => s.issues.length).map((s) => (
              <div key={s.company.id}>
                <h3>{s.company.name || 'Uden navn'}</h3>
                <ul>{s.issues.map((i) => <li key={i}>{i}</li>)}</ul>
              </div>
            ))}
            {differences.length > 0 && (
              <div>
                <h3>Faktorkilder der afviger mellem virksomhederne</h3>
                <p className="muted">Koncerntotalen blander her forskellige kilder for samme faktor.</p>
                <ul>
                  {differences.map((d) => (
                    <li key={d.factor.id}>
                      {d.factor.name} ({d.factor.region}): {d.companies.map((c) => `${c.name || 'Uden navn'}: ${sourceLabel(c.key)}`).join('; ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="group-manage">
        <h2 id="group-manage">Virksomheder og ejerandele</h2>
        <p className="muted">
          Ejerandelen gælder fra det angivne år, indtil en ny ændring. Et år uden ejerandel tæller
          med 0 %. Moderselskabet ejes 100 %.
        </p>
        {group.companies.map((c) => (
          <CompanyEditor
            key={c.id}
            company={c}
            canRemove={group.companies.length > 1}
            onRename={(name) => updateCompany(c.id, { name })}
            onOwnership={(ownership) => updateCompany(c.id, { ownership })}
            onRemove={() => removeCompany(c)}
          />
        ))}
        <form className="add-company" onSubmit={addCompany}>
          <label htmlFor={`${groupNameId}-new`}>Ny virksomhed</label>
          <input id={`${groupNameId}-new`} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Fx Heartland Danmark ApS" />
          <button type="submit" disabled={!newName.trim()}>Tilføj</button>
        </form>
      </section>
    </>
  )
}

function TotalsCells({ totals }: { totals: Totals }) {
  return (
    <>
      <td className="num">{t(totals.scope1)}</td>
      <td className="num">{t(totals.scope2Location)}</td>
      <td className="num">{t(totals.scope2Market)}</td>
      <td className="num">{t(totals.scope3)}</td>
    </>
  )
}

/** One share when it's the same all period, otherwise per year */
function ownershipText(ownership: { year: number; pct: number | null }[]): string {
  const pcts = new Set(ownership.map((o) => o.pct))
  if (pcts.size === 1) {
    const [pct] = pcts
    return pct === null ? 'mangler' : `${formatNumber(pct, 0)} %`
  }
  return ownership.map((o) => `${o.year}: ${o.pct === null ? 'mangler' : `${formatNumber(o.pct, 0)} %`}`).join(', ')
}

function sourceLabel(key: string): string {
  if (key === 'builtin') return 'indbygget tabel'
  if (key.startsWith('publication:')) return factorPublications.find((p) => p.id === key.slice(12))?.name ?? 'publikation'
  if (key.startsWith('manual:')) return 'egen værdi'
  return 'API'
}

function CompanyEditor({ company, canRemove, onRename, onOwnership, onRemove }: {
  company: Company
  canRemove: boolean
  onRename: (name: string) => void
  onOwnership: (o: OwnershipShare[]) => void
  onRemove: () => void
}) {
  const id = useId()
  const sorted = [...company.ownership].sort((a, b) => a.fromYear - b.fromYear)
  return (
    <fieldset className="company-editor">
      <legend>{company.name || 'Uden navn'}</legend>
      <div className="field">
        <label htmlFor={`${id}-name`}>Navn</label>
        <input id={`${id}-name`} value={company.name} onChange={(e) => onRename(e.target.value)} />
      </div>
      <table className="ownership">
        <caption className="visually-hidden">Ejerandel for {company.name}</caption>
        <thead><tr><th scope="col">Fra år</th><th scope="col">Ejerandel (%)</th><th scope="col"><span className="visually-hidden">Handling</span></th></tr></thead>
        <tbody>
          {sorted.map((o, i) => (
            <OwnershipRow
              key={`${o.fromYear}-${i}`}
              share={o}
              companyName={company.name}
              onChange={(next) => onOwnership(sorted.map((x, j) => (j === i ? next : x)))}
              onRemove={() => onOwnership(sorted.filter((_, j) => j !== i))}
            />
          ))}
        </tbody>
      </table>
      <div className="databar-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => {
            const last = sorted[sorted.length - 1]
            onOwnership([...sorted, { fromYear: last ? last.fromYear + 1 : new Date().getFullYear(), pct: last?.pct ?? 100 }])
          }}
        >
          Tilføj ændring af ejerandel
        </button>
        {canRemove && <button type="button" className="link" onClick={onRemove}>Slet virksomheden</button>}
      </div>
    </fieldset>
  )
}

function OwnershipRow({ share, companyName, onChange, onRemove }: { share: OwnershipShare; companyName: string; onChange: (s: OwnershipShare) => void; onRemove: () => void }) {
  const id = useId()
  const [year, setYear] = useState(String(share.fromYear))
  const [pct, setPct] = useState(formatNumber(share.pct, 0))
  const [error, setError] = useState<string | null>(null)
  function commit() {
    const y = Number(year.trim())
    const p = parseNumber(pct)
    if (!/^\d{4}$/.test(year.trim()) || y < 1900 || y > 2100) return setError('Angiv et årstal, fx 2025.')
    if (p === null || Number.isNaN(p) || p < 0 || p > 100) return setError('Angiv en ejerandel mellem 0 og 100.')
    setError(null)
    if (y !== share.fromYear || p !== share.pct) onChange({ fromYear: y, pct: p })
  }
  return (
    <tr>
      <td>
        <label htmlFor={`${id}-y`} className="visually-hidden">Fra år, {companyName}</label>
        <input id={`${id}-y`} className="year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit() }} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} />
      </td>
      <td>
        <label htmlFor={`${id}-p`} className="visually-hidden">Ejerandel i procent, {companyName}</label>
        <input id={`${id}-p`} className="pct" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit() }} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} />
        {error && <p id={`${id}-err`} className="error">{error}</p>}
      </td>
      <td><button type="button" className="link" onClick={onRemove}>Fjern</button></td>
    </tr>
  )
}
