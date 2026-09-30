import { useId, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { Factor } from '../data/factors'
import type { Period } from '../calc/dates'
import { parseNumber } from '../calc/parseNumber'
import type { Scope1Line } from '../calc/scope1'
import { scope2Summary, type Location, type Scope2Line } from '../calc/scope2'
import { category3, scope3Categories, type Category3Params } from '../calc/scope3'
import { formatFactor, formatNumber } from '../format'
import { Tile } from '../ui'
import type { Relevance } from './relevance'

/** Categories with a calculation so far. The rest are listed but not calculated yet. */
const calculated = new Set([3])

type Props = {
  period: Period
  factors: readonly Factor[]
  scope1Lines: readonly Scope1Line[]
  locations: readonly Location[]
  scope2Lines: readonly Scope2Line[]
  relevance: Relevance
  setRelevance: Dispatch<SetStateAction<Relevance>>
  params: Category3Params
  setParams: Dispatch<SetStateAction<Category3Params>>
}

export function Scope3Page({ period, factors, scope1Lines, locations, scope2Lines, relevance, setRelevance, params, setParams }: Props) {
  const scope2 = useMemo(() => scope2Summary(locations, scope2Lines, factors, period), [locations, scope2Lines, factors, period])
  const cat3 = useMemo(() => category3(scope1Lines, scope2, factors, period, params), [scope1Lines, scope2, factors, period, params])
  const cat3Included = relevance[3]?.relevant ?? true
  const total = cat3Included ? cat3.total : 0
  const pendingRelevant = scope3Categories.filter((c) => relevance[c.nr]?.relevant && !calculated.has(c.nr))

  const update = (nr: number, patch: Partial<Relevance[number]>) =>
    setRelevance((r) => ({ ...r, [nr]: { ...r[nr], ...patch } }))

  return (
    <>
      <h1>Scope 3 — værdikæden</h1>
      <p className="lead">
        Indirekte udledninger i værdikæden, fordelt på GHG-protokollens 15 kategorier. Marker
        hvilke kategorier der er relevante, og begrund valget.
      </p>

      <section aria-labelledby="s3-totals">
        <h2 id="s3-totals" className="visually-hidden">Totaler</h2>
        <dl className="tiles" aria-live="polite">
          <Tile label="Scope 3, beregnet indtil videre" value={total} accent />
          <Tile label="Kategori 3 — brændstof og energi" value={cat3.total} note={cat3Included ? undefined : 'Markeret ikke relevant — tæller ikke med'} />
        </dl>
        {pendingRelevant.length > 0 && (
          <p className="warning">
            <strong>Scope 3 er ikke komplet.</strong> Kun kategori 3 beregnes endnu.{' '}
            {pendingRelevant.length === 1 ? 'Kategori' : 'Kategorierne'}{' '}
            {pendingRelevant.map((c) => c.nr).join(', ')} er markeret relevante, men
            mangler stadig i appen.
          </p>
        )}
      </section>

      <Category3Section cat3={cat3} params={params} setParams={setParams} />

      <section aria-labelledby="s3-categories">
        <h2 id="s3-categories">Kategorier og relevans</h2>
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">Scope 3-kategorier</caption>
            <thead>
              <tr>
                <th scope="col">Kategori</th>
                <th scope="col">Relevant</th>
                <th scope="col">Begrundelse</th>
                <th scope="col" className="num">tCO2e</th>
              </tr>
            </thead>
            <tbody>
              {scope3Categories.map((c) => {
                const r = relevance[c.nr]
                return (
                  <tr key={c.nr}>
                    <th scope="row">
                      {c.nr}. {c.name}
                      <span className="sub">{c.english}</span>
                    </th>
                    <td>
                      <label className="check">
                        <input type="checkbox" checked={r.relevant} onChange={(e) => update(c.nr, { relevant: e.target.checked })} />
                        <span className="visually-hidden">Kategori {c.nr} er relevant</span>
                        <span aria-hidden="true">{r.relevant ? 'Ja' : 'Nej'}</span>
                      </label>
                    </td>
                    <td>
                      <label className="visually-hidden" htmlFor={`reason-${c.nr}`}>Begrundelse for kategori {c.nr}</label>
                      <input id={`reason-${c.nr}`} className="reason" value={r.reason} onChange={(e) => update(c.nr, { reason: e.target.value })} />
                    </td>
                    <td className="num">
                      {!r.relevant ? (
                        <span className="muted">Ikke relevant</span>
                      ) : calculated.has(c.nr) ? (
                        formatNumber(cat3.total, 3)
                      ) : (
                        <span className="pending">Kommer senere</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function Category3Section({ cat3, params, setParams }: { cat3: ReturnType<typeof category3>; params: Category3Params; setParams: Dispatch<SetStateAction<Category3Params>> }) {
  return (
    <section aria-labelledby="cat3-heading">
      <h2 id="cat3-heading">Kategori 3 — brændstof- og energirelaterede aktiviteter</h2>
      <p className="muted">
        Beregnes automatisk af brændstofforbruget i Scope 1 og el- og fjernvarmeforbruget i
        Scope 2: udledninger fra udvinding, raffinering og transport af brændstoffet
        (well-to-tank) og fra tab i el- og varmenettet.
      </p>

      <div className="table-wrap">
        <table>
          <caption className="visually-hidden">Kategori 3-beregning</caption>
          <thead>
            <tr>
              <th scope="col">Kilde</th>
              <th scope="col" className="num">Mængde</th>
              <th scope="col" className="num">Faktor</th>
              <th scope="col" className="num">tCO2e</th>
            </tr>
          </thead>
          <tbody>
            {cat3.fuels.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">Intet brændstof i Scope 1 for perioden.</td>
              </tr>
            )}
            {cat3.fuels.map((f) => (
              <tr key={f.group}>
                <th scope="row">
                  {f.label}
                  <span className="sub">Fra Scope 1 · {f.factor?.source}</span>
                </th>
                <td className="num">{formatNumber(f.quantity, 2)} {f.unit}</td>
                <td className="num">{f.factor?.value == null ? <span className="pending">Faktor mangler</span> : `${formatFactor(f.factor.value)} kg/${f.unit}`}</td>
                <td className="num">{formatNumber(f.tCO2e, 3)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">
                El — well-to-tank
                <span className="sub">Direkte faktor × WTT-ratio = {formatFactor(cat3.gridFactor)} × {formatFactor(params.wttRatio)}</span>
              </th>
              <td className="num" rowSpan={2}>{formatNumber(cat3.electricityKWh, 0)} kWh</td>
              <td className="num">{formatFactor(cat3.electricityWtt)} kg/kWh</td>
              <td className="num" rowSpan={2}>{formatNumber(cat3.electricityT, 3)}</td>
            </tr>
            <tr>
              <th scope="row">
                El — nettab, well-to-tank
                <span className="sub">(direkte ÷ (1 − nettab) − direkte) × WTT-ratio</span>
              </th>
              <td className="num">{formatFactor(cat3.electricityLossWtt)} kg/kWh</td>
            </tr>
            <tr>
              <th scope="row">
                Fjernvarme — distributionstab
                <span className="sub">{cat3.heatingLossFactor?.name} · {cat3.heatingLossFactor?.source}</span>
              </th>
              <td className="num">{formatNumber(cat3.heatingKWh, 0)} kWh</td>
              <td className="num">{cat3.heatingLossFactor?.value == null ? <span className="pending">Faktor mangler</span> : `${formatFactor(cat3.heatingLossFactor.value)} kg/kWh`}</td>
              <td className="num">{formatNumber(cat3.heatingT, 3)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>Kategori 3 i alt</th>
              <td className="num strong">{formatNumber(cat3.total, 3)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <fieldset className="params">
        <legend>Parametre for el</legend>
        <ParamInput
          label="Nettab i elnettet"
          hint="Andel, fx 0,07 (Energinet)"
          value={params.gridLoss}
          validate={(v) => (v < 0 || v >= 1 ? 'Skal være mindst 0 og under 1.' : null)}
          onChange={(gridLoss) => setParams((p) => ({ ...p, gridLoss }))}
        />
        <ParamInput
          label="WTT-ratio for el"
          hint="Fx 0,2419 (BEIS 2025)"
          value={params.wttRatio}
          validate={(v) => (v < 0 ? 'Kan ikke være negativ.' : null)}
          onChange={(wttRatio) => setParams((p) => ({ ...p, wttRatio }))}
        />
      </fieldset>
    </section>
  )
}

function ParamInput({ label, hint, value, validate, onChange }: { label: string; hint: string; value: number; validate: (v: number) => string | null; onChange: (v: number) => void }) {
  const id = useId()
  const [text, setText] = useState(formatFactor(value))
  const [error, setError] = useState<string | null>(null)
  function commit() {
    const v = parseNumber(text)
    const problem = v === null || Number.isNaN(v) ? 'Ikke et gyldigt tal.' : validate(v)
    setError(problem)
    if (!problem && v !== null) onChange(v)
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label} <span className="optional">({hint})</span></label>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
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
