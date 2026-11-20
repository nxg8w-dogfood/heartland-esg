import { useMemo, useState } from 'react'
import { companyOverview, findNode, monthlyTrees, monthlyValues, sharePct } from '../calc/companyOverview'
import type { Period } from '../calc/dates'
import type { Factor } from '../data/factors'
import { formatNumber } from '../format'
import { scope3Href } from '../scope3/subpages'
import type { AccountData } from '../storage/account'
import { Tile } from '../ui'
import { DrillChart } from './DrillChart'
import { nodeHref } from './nodeHref'

type Props = { account: AccountData; factors: readonly Factor[]; period: Period }

const t = (v: number) => formatNumber(v, 3)
const pct = (v: number | null) => (v === null ? '—' : `${formatNumber(v, 1)} %`)

/** One company's climate account at a glance: the three scopes, what each is made of, and what's missing. */
export function CompanyOverviewPage({ account, factors, period }: Props) {
  const [selected, setSelected] = useState('')
  // Scope 2 is reported both ways (GHG Protocol's dual reporting), so every figure is worked
  // out with each method; they differ only in Scope 2 and the totals above it.
  const o = useMemo(() => companyOverview(account, factors, period, 'market'), [account, factors, period])
  const byLocation = useMemo(() => companyOverview(account, factors, period, 'location').tree, [account, factors, period])
  const months = useMemo(() => monthlyTrees(account, factors, period, 'market'), [account, factors, period])
  const locationMonths = useMemo(() => monthlyTrees(account, factors, period, 'location'), [account, factors, period])
  // A part can disappear when the data changes; then the chart starts from the top.
  const current = findNode(o.tree, selected) ? selected : ''
  const monthValues = useMemo(() => monthlyValues(months, current), [months, current])
  const locationMonthValues = useMemo(() => monthlyValues(locationMonths, current), [locationMonths, current])

  const { totals } = o
  const scopes = [
    { id: 'scope1', label: 'Scope 1', note: 'Direkte udledning', href: '#/scope1', location: totals.scope1, market: totals.scope1 },
    { id: 'scope2', label: 'Scope 2', note: 'Indkøbt el og varme', href: '#/scope2', location: totals.scope2Location, market: totals.scope2Market },
    { id: 'scope3', label: 'Scope 3', note: 'Værdikæden, relevante kategorier', href: '#/scope3', location: totals.scope3, market: totals.scope3 },
  ]
  const categories = findNode(o.tree, 's3')!.children
  const issues = totals.issues

  return (
    <>
      <h1>Oversigt</h1>
      <p className="lead">
        Virksomhedens klimaregnskab for perioden, fordelt på de tre scopes. Det er de tal, virksomheden
        tæller med på koncernsiden, før ejerandelen.
      </p>

      <section aria-labelledby="overview-totals">
        <h2 id="overview-totals" className="visually-hidden">Totaler</h2>
        <dl className="tiles" aria-live="polite">
          <Tile label="I alt, market-based" value={o.market} accent note={issues.length ? `Ufuldstændig — ${issues.length} forhold nedenfor` : undefined} />
          <Tile label="I alt, location-based" value={o.location} />
          <Tile label="Scope 1" value={totals.scope1} />
          <Tile label="Scope 2, market-based" value={totals.scope2Market} note={`Location-based: ${t(totals.scope2Location)}`} />
          <Tile label="Scope 3" value={totals.scope3} />
        </dl>
      </section>

      <section aria-labelledby="overview-drill">
        <h2 id="overview-drill">Hvor kommer udledningen fra?</h2>
        <p className="muted">
          Klik på en del for at se, hvad den består af: scope, kilde, lokation eller kategori, og videre ned.
          Scope 2 vises både market-based og location-based.
        </p>
        <DrillChart tree={o.tree} locationTree={byLocation} selected={current} onSelect={setSelected} months={monthValues} locationMonths={locationMonthValues} />
      </section>

      <section aria-labelledby="overview-scopes">
        <h2 id="overview-scopes">De tre scopes</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Scope</th>
                <th scope="col" className="num">Location-based</th>
                <th scope="col" className="num">Market-based</th>
                <th scope="col" className="num">Andel (market)</th>
              </tr>
            </thead>
            <tbody>
              {scopes.map((s) => (
                <tr key={s.id}>
                  <th scope="row"><a href={s.href}>{s.label}</a> <span className="muted">{s.note}</span></th>
                  <td className="num">{t(s.location)}</td>
                  <td className="num">{t(s.market)}</td>
                  <td className="num">{pct(sharePct(s.market, o.market))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">I alt</th>
                <td className="num"><strong>{t(o.location)}</strong></td>
                <td className="num"><strong>{t(o.market)}</strong></td>
                <td className="num">{o.market > 0 ? '100 %' : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section aria-labelledby="overview-scope3">
        <h2 id="overview-scope3">Scope 3, alle 15 kategorier</h2>
        <p className="muted">
          Kun kategorier markeret relevante tæller med. Relevansen sættes under{' '}
          <a href={scope3Href('indstillinger')}>Scope 3 → Indstillinger</a>.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Kategori</th>
                <th scope="col">Relevant</th>
                <th scope="col" className="num">tCO2e</th>
                <th scope="col" className="num">Andel af Scope 3</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className={c.excluded ? 'muted' : undefined}>
                  <th scope="row">
                    <a href={nodeHref(c)!}>{c.label}</a>
                    {c.note && <span className="muted"> ({c.note.toLowerCase()})</span>}
                  </th>
                  <td>{c.excluded ? 'Nej' : 'Ja'}</td>
                  <td className="num">{t(c.value)}</td>
                  <td className="num">{c.excluded ? '—' : pct(sharePct(c.value, totals.scope3))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Scope 3</th>
                <td />
                <td className="num"><strong>{t(totals.scope3)}</strong></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section aria-labelledby="overview-completeness">
        <h2 id="overview-completeness">Fuldstændighed</h2>
        {issues.length === 0 ? <p>Ingen mangler fundet for perioden.</p> : <ul>{issues.map((i) => <li key={i}>{i}</li>)}</ul>}
      </section>
    </>
  )
}
