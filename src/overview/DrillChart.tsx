import { nodePath, sharePct, type DrillNode, type MonthValue } from '../calc/companyOverview'
import { MonthChart } from '../charts/MonthChart'
import { formatNumber } from '../format'
import { nodeHref } from './nodeHref'

const t = (v: number) => formatNumber(v, 3)
const pct = (v: number | null) => (v === null ? '—' : `${formatNumber(v, 1)} %`)

/**
 * A bar per part of the selected figure, largest first; a part that has parts of its own is a
 * button that drills into it. The path back up is above, and the selected figure month by month
 * below. The bars sit in a table, so every value can be read without the chart.
 */
export function DrillChart({ tree, selected, onSelect, months }: {
  tree: DrillNode
  selected: string
  onSelect: (id: string) => void
  months: MonthValue[]
}) {
  const path = nodePath(tree, selected)
  const node = path[path.length - 1]
  const parts = node.children
  const max = Math.max(0, ...parts.map((p) => p.value))
  const href = nodeHref(node)

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
        <strong>{t(node.value)}</strong> tCO2e
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
                <th scope="col"><span className="visually-hidden">Søjle</span></th>
                <th scope="col" className="num">tCO2e</th>
                <th scope="col" className="num">Andel</th>
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
                    <span className="bar" style={{ width: max > 0 ? `${(Math.max(0, p.value) / max) * 100}%` : 0 }} />
                  </td>
                  <td className="num">{t(p.value)}</td>
                  <td className="num">{p.excluded ? '—' : pct(sharePct(p.value, node.value))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MonthChart title="Måned for måned" subtitle={`${node.label}, tCO2e`} unit="tCO2e" months={months} />
    </div>
  )
}

