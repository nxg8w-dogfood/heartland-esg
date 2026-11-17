import { useMemo } from 'react'
import { companyOverview, sharePct, type OverviewPart } from '../calc/companyOverview'
import type { Period } from '../calc/dates'
import type { Factor } from '../data/factors'
import { formatNumber } from '../format'
import { categorySubpage, scope3Href } from '../scope3/subpages'
import type { AccountData } from '../storage/account'
import { Tile } from '../ui'

type Props = { account: AccountData; factors: readonly Factor[]; period: Period }

const t = (v: number) => formatNumber(v, 3)
const pct = (v: number | null) => (v === null ? '—' : `${formatNumber(v, 1)} %`)

/** One company's climate account at a glance: the three scopes, what each is made of, and what's missing. */
export function CompanyOverviewPage({ account, factors, period }: Props) {
  const o = useMemo(() => companyOverview(account, factors, period), [account, factors, period])
  const { totals } = o
  const scopes = [
    { id: 'scope1', label: 'Scope 1', note: 'Direkte udledning', href: '#/scope1', location: totals.scope1, market: totals.scope1 },
    { id: 'scope2', label: 'Scope 2', note: 'Indkøbt el og varme', href: '#/scope2', location: totals.scope2Location, market: totals.scope2Market },
    { id: 'scope3', label: 'Scope 3', note: 'Værdikæden, relevante kategorier', href: '#/scope3', location: totals.scope3, market: totals.scope3 },
  ]
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

      <section aria-labelledby="overview-scopes">
        <h2 id="overview-scopes">De tre scopes</h2>
        {o.market > 0 && (
          <div className="share-bar" aria-hidden="true">
            {scopes.map((s) => {
              const share = sharePct(s.market, o.market) ?? 0
              return share > 0 ? <span key={s.id} className={`share-${s.id}`} style={{ width: `${share}%` }} title={`${s.label}: ${pct(share)}`} /> : null
            })}
          </div>
        )}
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
                  <th scope="row">
                    <span className={`share-key share-${s.id}`} aria-hidden="true" />
                    <a href={s.href}>{s.label}</a> <span className="muted">{s.note}</span>
                  </th>
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

      <section aria-labelledby="overview-scope1">
        <h2 id="overview-scope1">Scope 1</h2>
        <Parts caption="Scope 1 fordelt på kilde" parts={o.scope1} total={totals.scope1} />
      </section>

      <section aria-labelledby="overview-scope2">
        <h2 id="overview-scope2">Scope 2</h2>
        {o.scope2.length === 0 ? (
          <p className="muted">Ingen lokationer endnu. <a href="#/scope2">Tilføj en på Scope 2</a>.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">Scope 2 fordelt på lokation</caption>
              <thead>
                <tr>
                  <th scope="col">Lokation</th>
                  <th scope="col" className="num">Location-based</th>
                  <th scope="col" className="num">Market-based</th>
                  <th scope="col" className="num">Andel (market)</th>
                </tr>
              </thead>
              <tbody>
                {o.scope2.map((l) => (
                  <tr key={l.id}>
                    <th scope="row">{l.name || 'Uden navn'}</th>
                    <td className="num">{t(l.location)}</td>
                    <td className="num">{t(l.market)}</td>
                    <td className="num">{pct(sharePct(l.market, totals.scope2Market))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Scope 2</th>
                  <td className="num"><strong>{t(totals.scope2Location)}</strong></td>
                  <td className="num"><strong>{t(totals.scope2Market)}</strong></td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="overview-scope3">
        <h2 id="overview-scope3">Scope 3</h2>
        <p className="muted">
          Kun kategorier markeret relevante tæller med. Relevansen sættes under{' '}
          <a href={scope3Href('indstillinger')}>Scope 3 → Indstillinger</a>.
        </p>
        <Parts caption="Scope 3 fordelt på kategori" parts={o.scope3} total={totals.scope3} />
      </section>

      <section aria-labelledby="overview-completeness">
        <h2 id="overview-completeness">Fuldstændighed</h2>
        {issues.length === 0 ? <p>Ingen mangler fundet for perioden.</p> : <ul>{issues.map((i) => <li key={i}>{i}</li>)}</ul>}
      </section>
    </>
  )
}

function Parts({ caption, parts, total }: { caption: string; parts: OverviewPart[]; total: number }) {
  return (
    <div className="table-wrap">
      <table>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Kilde</th>
            <th scope="col" className="num">tCO2e</th>
            <th scope="col" className="num">Andel</th>
          </tr>
        </thead>
        <tbody>
          {parts.map((p) => {
            const sub = p.nr === undefined ? undefined : categorySubpage(p.nr)
            return (
              <tr key={p.label} className={p.excluded ? 'muted' : undefined}>
                <th scope="row">
                  {sub ? <a href={scope3Href(sub.id)}>{p.label}</a> : p.label}
                  {p.excluded && <span className="muted"> (ikke relevant, tæller ikke med)</span>}
                </th>
                <td className="num">{t(p.value)}</td>
                <td className="num">{p.excluded ? '—' : pct(sharePct(p.value, total))}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">I alt</th>
            <td className="num"><strong>{t(total)}</strong></td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
