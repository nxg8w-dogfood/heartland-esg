import { findNode, nodePath, sharePct, type DrillNode, type MonthValue } from '../calc/companyOverview'
import { MonthChart } from '../charts/MonthChart'
import { formatNumber } from '../format'
import { nodeHref } from './nodeHref'

const t = (v: number) => formatNumber(v, 3)
const pct = (v: number | null) => (v === null ? '—' : `${formatNumber(v, 1)} %`)

/** Values this close are the same figure, rounding aside. */
const same = (a: number, b: number) => Math.abs(a - b) < 1e-9

/**
 * A bar per part of the selected figure, largest first; a part that has parts of its own is a
 * button that drills into it. The path back up is above, and the selected figure month by month
 * below. The bars sit in a table, so every value can be read without the chart.
 *
 * `tree` is market-based and `locationTree` the same tree location-based: each part shows both
 * figures, and a part whose figures differ (Scope 2 and what it's in) gets a second bar.
 */
export function DrillChart({ tree, locationTree, selected, onSelect, months, locationMonths }: {
  tree: DrillNode
  locationTree: DrillNode
  selected: string
  onSelect: (id: string) => void
  months: MonthValue[]
  locationMonths: MonthValue[]
}) {
  const path = nodePath(tree, selected)
  const node = path[path.length - 1]
  const parts = node.children
  const loc = (n: DrillNode) => findNode(locationTree, n.id)?.value ?? 0
  const max = Math.max(0, ...parts.flatMap((p) => [p.value, loc(p)]))
  const width = (v: number) => (max > 0 ? `${(Math.max(0, v) / max) * 100}%` : 0)
  const href = nodeHref(node)
  const nodeDiffers = !same(node.value, loc(node))
  const anyDiffers = nodeDiffers || parts.some((p) => !same(p.value, loc(p)))

  return (
    <div className="drill">
      <nav aria-label="Niveau" className="drill-path">
        <ol>
          {path.map((n, i) => (
            <li key={n.id}>
              {i < path.length - 1 ? (
                <button type="button" className="link" onClick={() => onSelect(n.id)}>{n.label}</button>
              ) : (
                <span aria-current="location">{n.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <p className="drill-figure">
        <strong>{t(node.value)}</strong> tCO2e{nodeDiffers && <> market-based · <strong>{t(loc(node))}</strong> tCO2e location-based</>}
        {node.excluded && <span className="muted"> — markeret ikke relevant, tæller ikke med</span>}
        {href && <> · <a href={href}>Gå til siden</a></>}
      </p>

      {parts.length === 0 ? (
        <p className="muted">{node.note ?? (node.value ? 'Kan ikke opdeles yderligere.' : 'Ingen udledning i perioden.')}</p>
      ) : (
        <div className="table-wrap">
          <table className="drill-bars">
            <caption className="visually-hidden">{node.label} fordelt</caption>
            <thead>
              <tr>
                <th scope="col">Del</th>
                <th scope="col">
                  {anyDiffers ? (
                    <span className="bar-legend" aria-hidden="true">
                      <span><span className="swatch" /> Market-based</span>
                      <span><span className="swatch location" /> Location-based</span>
                    </span>
                  ) : <span className="visually-hidden">Søjle</span>}
                </th>
                {anyDiffers ? (
                  <>
                    <th scope="col" className="num">Market-based<span className="sub">tCO2e</span></th>
                    <th scope="col" className="num">Location-based<span className="sub">tCO2e</span></th>
                  </>
                ) : <th scope="col" className="num">tCO2e</th>}
                <th scope="col" className="num">Andel{anyDiffers && <span className="sub">market-based</span>}</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id} className={p.excluded ? 'excluded' : undefined}>
                  <th scope="row">
                    {p.children.length > 0 ? (
                      <button type="button" className="link" onClick={() => onSelect(p.id)} aria-label={`${p.label}, vis fordeling`}>{p.label}</button>
                    ) : p.label}
                    {p.excluded && <span className="muted"> (tæller ikke med)</span>}
                    {p.note && <span className="muted"> ({p.note.toLowerCase()})</span>}
                  </th>
                  <td className="bar-cell" aria-hidden="true">
                    <span className="bar" style={{ width: width(p.value) }} />
                    {!same(p.value, loc(p)) && <span className="bar location" style={{ width: width(loc(p)) }} />}
                  </td>
                  <td className="num">{t(p.value)}</td>
                  {anyDiffers && <td className="num">{t(loc(p))}</td>}
                  <td className="num">{p.excluded ? '—' : pct(sharePct(p.value, node.value))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nodeDiffers ? (
        <div className="month-pair">
          <MonthChart title="Måned for måned" subtitle={`${node.label}, market-based, tCO2e`} unit="tCO2e" months={months} />
          <MonthChart title="Måned for måned" subtitle={`${node.label}, location-based, tCO2e`} unit="tCO2e" months={locationMonths} />
        </div>
      ) : (
        <MonthChart title="Måned for måned" subtitle={`${node.label}, tCO2e`} unit="tCO2e" months={months} />
      )}
    </div>
  )
}

