import { useId, useState, type Dispatch, type SetStateAction } from 'react'
import type { Factor } from '../data/factors'
import { parseNumber } from '../calc/parseNumber'
import { periodYearsList, type Period } from '../calc/dates'
import { deflationFor, deflationWarning, indexPoints, NPI_SERIES, regulateFactor, type Deflation } from '../calc/spend'
import { formatFactor } from '../format'
import { InfoTip } from '../ui'

/**
 * Index regulation of spend factors (docs/adr/0034): a factor in its base year's prices is
 * regulated to the year of the line it's used on. It applies to every spend line in Scope 3
 * (categories 1, 2, courier and parcels in 4, and 6) and to category 15 holdings with a spend
 * factor. The regulated factors for the selected period are listed here; Scope 3 shows only
 * the regulated value on each line.
 */
export function IndexRegulationPage({ deflation, setDeflation, factors, period }: {
  deflation: Deflation
  setDeflation: Dispatch<SetStateAction<Deflation>>
  factors: readonly Factor[]
  /** The selected period: its years are the ones the factors are regulated to */
  period: Period
}) {
  const id = useId()
  const seriesId = deflation.seriesId ?? NPI_SERIES
  const series = deflation.series.find((s) => s.id === seriesId) ?? null
  const points = series ? indexPoints(series) : []
  const spendFactors = factors.filter((f) => f.method === 'spend')
  const changed = spendFactors.filter((f) => deflation.factorSettings[f.id]?.baseYear != null).length
  const [newYear, setNewYear] = useState('')
  const [newValue, setNewValue] = useState('')
  const [pointError, setPointError] = useState<string | null>(null)

  const setPoints = (points: { year: number; value: number }[]) =>
    setDeflation((d) => ({ ...d, series: d.series.map((s) => (s.id === seriesId ? { ...s, points: [...points].sort((a, b) => a.year - b.year) } : s)) }))
  const addPoint = () => {
    const y = Number(newYear)
    const v = parseNumber(newValue)
    if (!Number.isInteger(y) || y < 1990 || y > 2100) return setPointError('Angiv et årstal, fx 2020.')
    if (v === null || Number.isNaN(v) || v <= 0) return setPointError('Angiv en indeksværdi over 0.')
    setPointError(null)
    setPoints([...(series?.points ?? []).filter((p) => p.year !== y), { year: y, value: v }])
    setNewYear('')
    setNewValue('')
  }

  return (
    <>
      <p className="lead">
        Regulér spendfaktorerne fra deres prisår til linjens år.{' '}
        <InfoTip label="Om indeksregulering">
          Faktor × indeks for basisåret ÷ indeks for linjens år. Gælder alle spendbaserede linjer
          (kategori 1, 2, kurér og pakker i 4, og 6) og investeringer i kategori 15, der bruger en
          spendfaktor.
        </InfoTip>
      </p>

      <div className="field wide">
        <label className="check">
          <input type="checkbox" checked={deflation.active} onChange={(e) => setDeflation((d) => ({ ...d, active: e.target.checked }))} />
          Indeksreguler spendfaktorer
        </label>
      </div>

      {deflation.active && (
        <>
          <section aria-labelledby={`${id}-series-h`}>
            <h2 id={`${id}-series-h`}>Indeksserie</h2>
            <div className="field">
              <label htmlFor={`${id}-series`}>Serie</label>
              <div className="source-cell">
                <select id={`${id}-series`} value={seriesId} onChange={(e) => setDeflation((d) => ({ ...d, seriesId: e.target.value }))}>
                  {deflation.series.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {series && <InfoTip label={`Om ${series.name}`}>{series.source}. {series.note}</InfoTip>}
              </div>
            </div>
            {series && (
              <details className="fold">
                <summary>
                  <span className="fold-title">Indeksværdier</span>
                  <span className="fold-count">
                    {points.length === 0 ? <span className="pending">ingen endnu</span> : `${points.length} år, ${points[0].year}–${points[points.length - 1].year}`}
                  </span>
                </summary>
                {points.length > 0 && (
                  <div className="table-wrap">
                    <table>
                      <caption className="visually-hidden">Indeksværdier for {series.name}</caption>
                      <thead><tr><th scope="col">År</th><th scope="col" className="num">Indeks</th><th scope="col">Kilde</th><th scope="col"><span className="visually-hidden">Handlinger</span></th></tr></thead>
                      <tbody>
                        {points.map((p) => (
                          <tr key={p.year}>
                            <td>{p.year}</td>
                            <td className="num">{formatFactor(p.value)}</td>
                            <td>{p.builtin ? series.source : 'Indtastet'}</td>
                            <td>{!p.builtin && <button type="button" className="link" onClick={() => setPoints(series.points.filter((x) => x.year !== p.year))} aria-label={`Slet indeksværdi for ${p.year}`}>Slet</button>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="add-line">
                  <div className="field">
                    <label htmlFor={`${id}-year`}>År</label>
                    <input id={`${id}-year`} inputMode="numeric" value={newYear} onChange={(e) => setNewYear(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor={`${id}-value`}>Indeksværdi</label>
                    <input id={`${id}-value`} inputMode="decimal" value={newValue} onChange={(e) => setNewValue(e.target.value)} aria-invalid={!!pointError} aria-describedby={pointError ? `${id}-perr` : undefined} />
                  </div>
                  <div className="field end">
                    <button type="button" className="secondary" onClick={addPoint}>Tilføj indeksværdi</button>
                  </div>
                  {pointError && <p id={`${id}-perr`} className="error">{pointError}</p>}
                </div>
              </details>
            )}
          </section>

          <RegulatedFactors id={id} deflation={deflation} factors={spendFactors} period={period} />

          <section aria-labelledby={`${id}-base-h`}>
            <h2 id={`${id}-base-h`}>Basisår</h2>
            <details className="fold">
              <summary>
                <span className="fold-title">Basisår pr. spendfaktor</span>{' '}
                <InfoTip label="Om basisår">Basisåret er faktorens faktorår, medmindre du angiver et andet her.</InfoTip>
                <span className="fold-count">{spendFactors.length} faktorer{changed > 0 && `, ${changed} ændret`}</span>
              </summary>
              <div className="table-wrap">
                <table>
                  <thead><tr><th scope="col">Faktor</th><th scope="col" className="num">Faktorår</th><th scope="col">Basisår</th></tr></thead>
                  <tbody>
                    {spendFactors.map((f) => (
                      <tr key={f.id}>
                        <th scope="row">{f.name}<span className="sub">{f.region}</span></th>
                        <td className="num">{f.priceYear ?? '—'}</td>
                        <td>
                          <YearField
                            label={`Basisår for ${f.name}, ${f.region}`}
                            value={deflation.factorSettings[f.id]?.baseYear ?? f.priceYear ?? null}
                            onCommit={(baseYear) => setDeflation((d) => ({ ...d, factorSettings: { ...d.factorSettings, [f.id]: { ...d.factorSettings[f.id], baseYear } } }))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        </>
      )}
    </>
  )
}

/** Each spend factor regulated to each year of the selected period. */
function RegulatedFactors({ id, deflation, factors, period }: { id: string; deflation: Deflation; factors: readonly Factor[]; period: Period }) {
  const years = periodYearsList(period)
  const withValue = factors.filter((f) => f.value !== null)
  return (
    <section aria-labelledby={`${id}-reg-h`}>
      <h2 id={`${id}-reg-h`}>Indeksregulerede faktorer for perioden</h2>
      <details className="fold" open>
        <summary>
          <span className="fold-title">{years.length === 1 ? `Reguleret til ${years[0]}` : `Reguleret til ${years.join(' og ')}`}</span>{' '}
          <InfoTip label="Om de regulerede faktorer">Det er disse værdier, Scope 3 bruger på spendbaserede linjer i perioden. Faktorer uden værdi er ikke med.</InfoTip>
          <span className="fold-count">{withValue.length} faktorer</span>
        </summary>
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">Indeksregulerede spendfaktorer for perioden</caption>
            <thead>
              <tr>
                <th scope="col">Faktor</th>
                <th scope="col" className="num">Værdi</th>
                <th scope="col" className="num">Basisår</th>
                {years.map((y) => <th key={y} scope="col" className="num">Reguleret til {y}</th>)}
              </tr>
            </thead>
            <tbody>
              {withValue.map((f) => (
                <tr key={f.id}>
                  <th scope="row">{f.name}<span className="sub">{f.region} · {f.unit}</span></th>
                  <td className="num">{formatFactor(f.value!)}</td>
                  <td className="num">{deflation.factorSettings[f.id]?.baseYear ?? f.priceYear ?? '—'}</td>
                  {years.map((y) => {
                    const d = deflationFor(deflation, f, `${y}-01-01`)
                    const warning = deflationWarning(d)
                    return (
                      <td key={y} className="num">
                        {warning ? <span className="pending" title={warning}>Kan ikke reguleres</span> : formatFactor(regulateFactor(f.value, d)!)}
                        {d.status === 'applied' && d.indexYear !== d.year && <span className="sub">indeks for {d.indexYear}</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}

/** A year, written without a thousands separator. Commits on blur or Enter. */
function YearField({ label, value, onCommit }: { label: string; value: number | null; onCommit: (year: number | null) => void }) {
  const id = useId()
  const [text, setText] = useState(value === null ? '' : String(value))
  const [error, setError] = useState<string | null>(null)
  function commit() {
    const t = text.trim()
    if (t === '') { setError(null); return onCommit(null) }
    const y = Number(t)
    if (!/^\d{4}$/.test(t) || y < 1990 || y > 2100) return setError('Angiv et årstal, fx 2020.')
    setError(null)
    onCommit(y)
  }
  return (
    <div className="value-input">
      <label htmlFor={id} className="visually-hidden">{label}</label>
      <input id={id} className="year" inputMode="numeric" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit() }} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} />
      {error && <p id={`${id}-err`} className="error">{error}</p>}
    </div>
  )
}
