import { useId, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { Factor } from '../data/factors'
import type { Period } from '../calc/dates'
import { parseNumber } from '../calc/parseNumber'
import type { ActivityLine } from '../calc/activity'
import { category7, type Survey } from '../calc/commuting'
import { category15, type Investment } from '../calc/investments'
import type { Deflation, SpendLine } from '../calc/spend'
import type { LedgerSpendLine } from '../calc/ledger'
import { currencyRates } from '../data/currencies'
import type { Scope1Line } from '../calc/scope1'
import { includedScope3Total } from '../calc/accountTotals'
import { scope2Summary, type Location, type Scope2Line } from '../calc/scope2'
import { category1, category3, category4, category5, category5Groups, category6, category6Groups, scope3Categories, type Category3Params } from '../calc/scope3'
import { ActivityLinesSection } from '../activity/ActivityLinesSection'
import { FreightSection } from './FreightSection'
import { CommutingSection } from './CommutingSection'
import { InvestmentsSection } from './InvestmentsSection'
import { DeflationPanel, PurchasesSection } from './PurchasesSection'
import { formatFactor, formatNumber } from '../format'
import { Tile } from '../ui'
import type { Relevance } from './relevance'
import { categorySubpage, scope3Href, scope3Subpages, type Scope3SubpageId } from './subpages'

const cat6Examples: Omit<ActivityLine, 'id'>[] = [
  { group: 'k6-fly-kort', date: '2025-03-12', quantity: 2 * 1250, description: 'København–Frankfurt t/r, 2 personer' },
  { group: 'k6-fly-lang', date: '2025-05-20', quantity: 12_800, description: 'København–New York t/r' },
  { group: 'k6-tog', date: '2025-09-04', quantity: 620, description: 'København–Aarhus t/r' },
  { group: 'k6-hotel', factorId: 'f-hotel-de', date: '2025-03-12', quantity: 4, description: 'Frankfurt, 2 nætter × 2' },
  { group: 'k6-hotel', factorId: 'f-hotel-us', date: '2025-05-20', quantity: 3, description: 'New York' },
  { group: 'k6-hotel', date: '2025-09-04', quantity: 1, description: 'Aarhus — vælg proxy-land' },
]

const cat5Examples: Omit<ActivityLine, 'id'>[] = [
  { group: 'k5-papir-gen', date: '2025-01-01', dateTo: '2025-12-31', quantity: 3.2, description: 'Papircontainer' },
  { group: 'k5-hush-forbr', date: '2025-01-01', dateTo: '2025-12-31', quantity: 5.8, description: 'Restaffald' },
  { group: 'k5-andet-gen', date: '2025-06-15', quantity: 0.4, description: 'Kasseret IT-udstyr' },
]

type Props = {
  /** Which of Scope 3's pages to show */
  subpage: Scope3SubpageId
  period: Period
  factors: readonly Factor[]
  scope1Lines: readonly Scope1Line[]
  locations: readonly Location[]
  scope2Lines: readonly Scope2Line[]
  relevance: Relevance
  setRelevance: Dispatch<SetStateAction<Relevance>>
  params: Category3Params
  setParams: Dispatch<SetStateAction<Category3Params>>
  cat4Lines: ActivityLine[]
  setCat4Lines: Dispatch<SetStateAction<ActivityLine[]>>
  cat4SpendLines: SpendLine[]
  setCat4SpendLines: Dispatch<SetStateAction<SpendLine[]>>
  cat5Lines: ActivityLine[]
  setCat5Lines: Dispatch<SetStateAction<ActivityLine[]>>
  cat6Lines: ActivityLine[]
  setCat6Lines: Dispatch<SetStateAction<ActivityLine[]>>
  surveys: Survey[]
  setSurveys: Dispatch<SetStateAction<Survey[]>>
  investments: Investment[]
  setInvestments: Dispatch<SetStateAction<Investment[]>>
  cat1Lines: SpendLine[]
  setCat1Lines: Dispatch<SetStateAction<SpendLine[]>>
  deflation: Deflation
  setDeflation: Dispatch<SetStateAction<Deflation>>
  /** Postings tagged to category 1 on the Kontoplan screen */
  ledgerLines: readonly LedgerSpendLine[]
}

/** The spend factors category 1 uses in the period: the ones a base year can be set for. */
const spendFactorsUsed = (cat1: ReturnType<typeof category1>): Factor[] =>
  [...new Map(cat1.lines.filter((r) => r.factor?.method === 'spend').map((r) => [r.factor!.id, r.factor!])).values()]

const pendingNote = (n: number) => (n === 0 ? undefined : n === 1 ? '1 linje afventer faktor' : `${n} linjer afventer faktor`)

export function Scope3Page(props: Props) {
  const { subpage, period, factors, scope1Lines, locations, scope2Lines, relevance, setRelevance, params, setParams, cat4Lines, setCat4Lines, cat4SpendLines, setCat4SpendLines, cat5Lines, setCat5Lines, cat6Lines, setCat6Lines, surveys, setSurveys, investments, setInvestments, cat1Lines, setCat1Lines, deflation, setDeflation, ledgerLines } = props
  const scope2 = useMemo(() => scope2Summary(locations, scope2Lines, factors, period), [locations, scope2Lines, factors, period])
  const cat3 = useMemo(() => category3(scope1Lines, scope2, factors, period, params), [scope1Lines, scope2, factors, period, params])
  const cat4 = useMemo(() => category4(cat4Lines, cat4SpendLines, factors, currencyRates, deflation, period), [cat4Lines, cat4SpendLines, factors, deflation, period])
  const cat5 = useMemo(() => category5(cat5Lines, factors, period), [cat5Lines, factors, period])
  const cat6 = useMemo(() => category6(cat6Lines, factors, period), [cat6Lines, factors, period])
  const cat7 = useMemo(() => category7(surveys, factors, period), [surveys, factors, period])
  const cat15 = useMemo(() => category15(investments, currencyRates, period), [investments, period])
  const cat1 = useMemo(() => category1(cat1Lines, factors, currencyRates, deflation, period, ledgerLines), [cat1Lines, factors, deflation, period, ledgerLines])

  /** Categories calculated so far, by number. The rest are listed but not calculated yet. */
  const calculated: Record<number, number> = { 1: cat1.total, 3: cat3.total, 4: cat4.total, 5: cat5.total, 6: cat6.total, 7: cat7.total, 15: cat15.total }
  const isIncluded = (nr: number) => relevance[nr]?.relevant ?? false
  const total = includedScope3Total(calculated, relevance)
  const pendingRelevant = scope3Categories.filter((c) => isIncluded(c.nr) && !(c.nr in calculated))
  const excludedNote = (nr: number) => (isIncluded(nr) ? undefined : 'Markeret ikke relevant — tæller ikke med')

  const update = (nr: number, patch: Partial<Relevance[number]>) =>
    setRelevance((r) => ({ ...r, [nr]: { ...r[nr], ...patch } }))

  const current = scope3Subpages.find((p) => p.id === subpage)!
  const nr = 'nr' in current ? current.nr : null

  return (
    <>
      <h1>Scope 3 — værdikæden</h1>
      <p className="lead">
        Indirekte udledninger i værdikæden, fordelt på GHG-protokollens 15 kategorier. Hver
        kategori, appen beregner, har sin egen side; relevans og parametre sættes under
        Indstillinger.
      </p>

      <nav aria-label="Scope 3" className="subnav">
        <ul>
          {scope3Subpages.map((p) => (
            <li key={p.id}>
              <a href={scope3Href(p.id)} aria-current={p.id === subpage ? 'page' : undefined}>{p.label}</a>
            </li>
          ))}
        </ul>
      </nav>

      {nr !== null && !isIncluded(nr) && (
        <p className="warning">
          Kategori {nr} er markeret ikke relevant under <a href={scope3Href('indstillinger')}>Indstillinger</a>,
          så linjerne her tæller ikke med i Scope 3.
        </p>
      )}

      {subpage === 'oversigt' && (
        <>
          <section aria-labelledby="s3-totals">
            <h2 id="s3-totals" className="visually-hidden">Totaler</h2>
            <dl className="tiles" aria-live="polite">
              <Tile label="Scope 3, beregnet indtil videre" value={total} accent />
              <Tile label="1 — indkøb" value={cat1.total} note={excludedNote(1) ?? pendingNote(cat1.pendingCount)} />
              <Tile label="3 — brændstof og energi" value={cat3.total} note={excludedNote(3)} />
              <Tile label="4 — transport" value={cat4.total} note={excludedNote(4) ?? pendingNote(cat4.pendingCount)} />
              <Tile label="5 — affald" value={cat5.total} note={excludedNote(5)} />
              <Tile label="6 — forretningsrejser" value={cat6.total} note={excludedNote(6)} />
              <Tile label="7 — pendling" value={cat7.total} note={excludedNote(7)} />
              <Tile label="15 — investeringer" value={cat15.total} note={excludedNote(15)} />
            </dl>
            {pendingRelevant.length > 0 && (
              <p className="warning">
                <strong>Scope 3 er ikke komplet.</strong> Kategori {Object.keys(calculated).join(', ')} beregnes.{' '}
                {pendingRelevant.length === 1 ? 'Kategori' : 'Kategorierne'}{' '}
                {pendingRelevant.map((c) => c.nr).join(', ')} er markeret relevante, men
                mangler stadig i appen.
              </p>
            )}
          </section>
          <CategoriesOverview relevance={relevance} calculated={calculated} />
        </>
      )}

      {subpage === 'kategori-1' && (
        <PurchasesSection cat1={cat1} lines={cat1Lines} setLines={setCat1Lines} factors={factors} defaultDate={period.start} />
      )}

      {subpage === 'kategori-3' && <Category3Section cat3={cat3} params={params} />}

      {subpage === 'kategori-4' && (
        <FreightSection
          cat4={cat4}
          lines={cat4Lines}
          setLines={setCat4Lines}
          spendLines={cat4SpendLines}
          setSpendLines={setCat4SpendLines}
          factors={factors}
          defaultDate={period.start}
        />
      )}

      {subpage === 'kategori-5' && (
        <ActivityLinesSection
          title="Kategori 5 — affald genereret i driften"
          intro="Affald fra egen drift pr. fraktion og behandlingsform, i tons."
          groups={category5Groups}
          factors={factors}
          summary={cat5}
          lines={cat5Lines}
          setLines={setCat5Lines}
          defaultDate={period.start}
          emptyText="Intet affald registreret i perioden."
          examples={cat5Examples}
        />
      )}

      {subpage === 'kategori-6' && (
        <ActivityLinesSection
          title="Kategori 6 — forretningsrejser"
          intro="Rejser i firmaets ærinde med fly, tog, bus, taxi, færge og firmabil, samt hotelovernatninger. Flyrejser angives i passagerkm (afstand × antal rejsende). Hotelnætter bruger BEIS' faktor for landet; Danmark findes ikke hos BEIS, så vælg et proxy-land eller angiv en verificeret egen faktor."
          groups={category6Groups}
          factors={factors}
          summary={cat6}
          lines={cat6Lines}
          setLines={setCat6Lines}
          defaultDate={period.start}
          emptyText="Ingen forretningsrejser i perioden."
          examples={cat6Examples}
        />
      )}

      {subpage === 'kategori-7' && <CommutingSection cat7={cat7} surveys={surveys} setSurveys={setSurveys} factors={factors} period={period} />}

      {subpage === 'kategori-15' && <InvestmentsSection cat15={cat15} investments={investments} setInvestments={setInvestments} period={period} />}

      {subpage === 'indstillinger' && (
        <>
          <section aria-labelledby="s3-categories">
            <h2 id="s3-categories">Kategorier og relevans</h2>
            <p className="muted">
              Kun kategorier, der er markeret relevante, tæller med i Scope 3. Begrund valget for
              hver kategori.
            </p>
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
                        <td className="num"><CategoryValue relevant={r.relevant} nr={c.nr} calculated={calculated} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="s3-cat3-params">
            <h2 id="s3-cat3-params">Kategori 3 — parametre for el</h2>
            <ElectricityParams params={params} setParams={setParams} />
          </section>

          <section aria-labelledby="s3-deflation">
            <h2 id="s3-deflation">Indeksregulering af spendfaktorer</h2>
            <p className="muted">Gælder de spendbaserede linjer i kategori 1 og kurér og pakker i kategori 4.</p>
            <DeflationPanel deflation={deflation} setDeflation={setDeflation} usedFactors={spendFactorsUsed(cat1)} />
          </section>
        </>
      )}
    </>
  )
}

function CategoryValue({ relevant, nr, calculated }: { relevant: boolean; nr: number; calculated: Record<number, number> }) {
  if (!relevant) return <span className="muted">Ikke relevant</span>
  if (nr in calculated) return <>{formatNumber(calculated[nr], 3)}</>
  return <span className="pending">Kommer senere</span>
}

/** All 15 categories at a glance, each linking to its page where it has one. Read-only: relevance is set under Indstillinger. */
function CategoriesOverview({ relevance, calculated }: { relevance: Relevance; calculated: Record<number, number> }) {
  return (
    <section aria-labelledby="s3-overview">
      <h2 id="s3-overview">Kategorier</h2>
      <p className="muted">
        Relevans og begrundelser rettes under <a href={scope3Href('indstillinger')}>Indstillinger</a>.
      </p>
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
              const page = categorySubpage(c.nr)
              return (
                <tr key={c.nr}>
                  <th scope="row">
                    {page ? <a href={scope3Href(page.id)}>{c.nr}. {c.name}</a> : <>{c.nr}. {c.name}</>}
                    <span className="sub">{c.english}</span>
                  </th>
                  <td>{r.relevant ? 'Ja' : 'Nej'}</td>
                  <td>{r.reason}</td>
                  <td className="num"><CategoryValue relevant={r.relevant} nr={c.nr} calculated={calculated} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Category3Section({ cat3, params }: { cat3: ReturnType<typeof category3>; params: Category3Params }) {
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

      <p className="muted">
        Nettab i elnettet er {formatFactor(params.gridLoss)} og WTT-ratioen for el{' '}
        {formatFactor(params.wttRatio)}. Begge rettes under{' '}
        <a href={scope3Href('indstillinger')}>Indstillinger</a>.
      </p>
    </section>
  )
}

/** The two electricity parameters category 3 uses. */
function ElectricityParams({ params, setParams }: { params: Category3Params; setParams: Dispatch<SetStateAction<Category3Params>> }) {
  return (
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
