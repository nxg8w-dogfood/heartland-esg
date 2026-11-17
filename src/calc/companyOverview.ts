// One company's three scopes side by side for the overview page: the totals the Koncern page
// counts the company with (accountTotals), and a tree of what each figure is made of, which
// the page's charts drill into: scope → source, location or category → fuel, energy or group.

import type { Factor } from '../data/factors'
import type { AccountData } from '../storage/account'
import { accountDetails, calculatedCategories, type AccountTotals } from './accountTotals'
import type { Period } from './dates'
import { scope3Categories } from './scope3'

export type Method = 'market' | 'location'

export type DrillNode = {
  /** A path, unique in the tree and the same from month to month, e.g. "s3/5/k5-mad-bio" */
  id: string
  label: string
  /** tCO2e */
  value: number
  /** The Scope 3 category, for a category's node */
  nr?: number
  /** Shown, but not counted in its parent's total (a Scope 3 category marked not relevant) */
  excluded?: boolean
  /** Why the value is what it is, e.g. that the app doesn't calculate the category yet */
  note?: string
  children: DrillNode[]
}

export type CompanyOverview = {
  totals: AccountTotals
  /** Scope 1 + 2 market-based + 3 */
  market: number
  /** Scope 1 + 2 location-based + 3 */
  location: number
  /** The whole account for one method, its children the three scopes */
  tree: DrillNode
}

const leaf = (id: string, label: string, value: number, extra: Partial<DrillNode> = {}): DrillNode => ({ id, label, value, children: [], ...extra })
const sum = (nodes: readonly DrillNode[]) => nodes.reduce((t, n) => t + (n.excluded ? 0 : n.value), 0)

/** Lines summed per label, largest first; lines without emissions are left out */
function byLabel(parent: string, rows: readonly { key: string; label: string; t: number }[]): DrillNode[] {
  const groups = new Map<string, DrillNode>()
  for (const r of rows) {
    if (!r.t) continue
    const g = groups.get(r.key) ?? leaf(`${parent}/${r.key}`, r.label, 0)
    g.value += r.t
    groups.set(r.key, g)
  }
  return [...groups.values()].sort((a, b) => b.value - a.value)
}

export function companyOverview(account: AccountData, factors: readonly Factor[], period: Period, method: Method = 'market'): CompanyOverview {
  const d = accountDetails(account, factors, period)
  const { totals } = d

  const scope1Kinds = [
    { kind: 'mobile', label: 'Mobil forbrænding (firmabiler)' },
    { kind: 'stationary', label: 'Stationær forbrænding (opvarmning)' },
    { kind: 'fugitive', label: 'Kølemidler' },
  ] as const
  const scope1 = scope1Kinds.map(({ kind, label }) => ({
    ...leaf(`s1/${kind}`, label, d.s1[kind]),
    children: byLabel(`s1/${kind}`, d.s1.lines.filter((r) => r.group.kind === kind).map((r) => ({ key: r.group.id, label: r.group.label, t: r.tCO2e }))),
  }))

  const scope2 = d.s2.locations.map((l) => {
    const id = `s2/${l.location.id}`
    const electricity = method === 'market' ? l.electricityMarketT : l.electricityLocationT
    return {
      ...leaf(id, l.location.name || 'Uden navn', method === 'market' ? l.marketTotal : l.locationTotal),
      children: [leaf(`${id}/el`, 'El', electricity), leaf(`${id}/varme`, 'Fjernvarme', l.heatingT)].filter((n) => n.value),
    }
  })

  const spend = (rows: readonly { group: { id: string; label: string }; tCO2e: number }[]) =>
    rows.map((r) => ({ key: r.group.id, label: r.group.label, t: r.tCO2e }))
  const parts: Record<number, (id: string) => DrillNode[]> = {
    1: (id) => byLabel(id, spend(d.cat1.lines)),
    2: (id) => byLabel(id, spend(d.cat2.lines)),
    3: (id) => [
      ...byLabel(`${id}/braendstof`, d.cat3.fuels.map((f) => ({ key: f.group, label: `${f.label}, udvinding og transport`, t: f.tCO2e }))),
      leaf(`${id}/el`, 'El, udvinding og nettab', d.cat3.electricityT),
      leaf(`${id}/varme`, 'Fjernvarme, nettab', d.cat3.heatingT),
    ].filter((n) => n.value),
    4: (id) => [
      ...byLabel(id, spend(d.cat4.freight.lines)),
      ...byLabel(id, d.cat4.courier.map((r) => ({ key: 'kurer', label: 'Kurer og pakker', t: r.tCO2e }))),
    ],
    5: (id) => byLabel(id, spend(d.cat5.lines)),
    6: (id) => byLabel(id, [...spend(d.cat6.lines), ...spend(d.cat6Spend.lines)]),
    7: (id) => byLabel(id, d.cat7.surveys.flatMap((s) => s.modes.map((m) => ({ key: m.mode.id, label: m.mode.label, t: m.tCO2e })))),
    15: (id) => byLabel(id, d.cat15.rows.filter((r) => r.included).map((r) => ({ key: r.investment.company.trim().toLowerCase() || r.investment.id, label: r.investment.company.trim() || 'Uden navn', t: r.kgCO2e / 1000 }))),
  }
  const calculated = calculatedCategories as readonly number[]
  const scope3 = scope3Categories.map((c) => {
    const id = `s3/${c.nr}`
    const node = leaf(id, `${c.nr} — ${c.name}`, totals.scope3ByCategory[c.nr] ?? 0, {
      nr: c.nr,
      excluded: !(account.relevance[c.nr]?.relevant ?? false),
      note: calculated.includes(c.nr) ? undefined : 'Beregnes ikke i appen endnu',
    })
    node.children = parts[c.nr]?.(id) ?? []
    return node
  })

  const scopes = [
    { ...leaf('s1', 'Scope 1', totals.scope1), children: scope1 },
    { ...leaf('s2', `Scope 2, ${method}-based`, method === 'market' ? totals.scope2Market : totals.scope2Location), children: scope2 },
    { ...leaf('s3', 'Scope 3', totals.scope3), children: scope3 },
  ]
  return {
    totals,
    market: totals.scope1 + totals.scope2Market + totals.scope3,
    location: totals.scope1 + totals.scope2Location + totals.scope3,
    tree: { ...leaf('', 'I alt', sum(scopes)), children: scopes },
  }
}

/** The node with this id, or null when the tree has none (it has no emissions in that month, say) */
export function findNode(tree: DrillNode, id: string): DrillNode | null {
  if (tree.id === id) return tree
  for (const c of tree.children) {
    if (id === c.id || id.startsWith(`${c.id}/`)) return findNode(c, id)
  }
  return null
}

/** The nodes from the top of the tree down to this one */
export function nodePath(tree: DrillNode, id: string): DrillNode[] {
  const path = [tree]
  let node = tree
  while (node.id !== id) {
    const next = node.children.find((c) => id === c.id || id.startsWith(`${c.id}/`))
    if (!next) break
    path.push(next)
    node = next
  }
  return path
}

export type MonthValue = { label: string; start: string; value: number }

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const pad = (n: number) => String(n).padStart(2, '0')

/** The calendar months the period touches, each cut to the period */
export function periodMonths(period: Period): (Period & { label: string })[] {
  const months: (Period & { label: string })[] = []
  let y = Number(period.start.slice(0, 4))
  let m = Number(period.start.slice(5, 7))
  while (`${y}-${pad(m)}-01` <= period.end) {
    const first = `${y}-${pad(m)}-01`
    const last = `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
    months.push({ start: first < period.start ? period.start : first, end: last > period.end ? period.end : last, label: `${MONTHS[m - 1]} ${y}` })
    if (++m > 12) { m = 1; y++ }
  }
  return months
}

/** One tree per month of the period. Lines are spread over the days they cover, as for the period. */
export function monthlyTrees(account: AccountData, factors: readonly Factor[], period: Period, method: Method): { label: string; start: string; tree: DrillNode }[] {
  return periodMonths(period).map((m) => ({ label: m.label, start: m.start, tree: companyOverview(account, factors, m, method).tree }))
}

/** A node's value month by month; 0 in a month where it has none */
export function monthlyValues(months: readonly { label: string; start: string; tree: DrillNode }[], id: string): MonthValue[] {
  return months.map((m) => ({ label: m.label, start: m.start, value: findNode(m.tree, id)?.value ?? 0 }))
}

/** A part's share of a total in percent, or null when the total is zero */
export const sharePct = (value: number, total: number): number | null => (total > 0 ? (value / total) * 100 : null)
