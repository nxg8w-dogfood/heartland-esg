// The lines table's optional grouping: by type, then date, or by month, then type. Each group
// carries its subtotal, and its quantity when all its lines share a unit.

import type { ActivityResult } from '../calc/activity'
import { monthLabel } from '../calc/wasteReport'

export type LineGrouping = 'none' | 'type' | 'month'

export type LineSection = {
  key: string
  /** null for the one ungrouped section */
  label: string | null
  lines: ActivityResult[]
  /** tCO2e */
  total: number
  /** In the period; null when the lines' units differ */
  quantity: number | null
  unit: string
}

const byDate = (a: ActivityResult, b: ActivityResult) => a.line.date.localeCompare(b.line.date)
const byType = (a: ActivityResult, b: ActivityResult) => a.group.label.localeCompare(b.group.label, 'da')

function section(key: string, label: string | null, lines: ActivityResult[]): LineSection {
  const units = new Set(lines.map((r) => r.group.unit))
  return {
    key,
    label,
    lines,
    total: lines.reduce((t, r) => t + r.tCO2e, 0),
    quantity: units.size === 1 ? lines.reduce((t, r) => t + (r.quantityInPeriod ?? 0), 0) : null,
    unit: units.size === 1 ? [...units][0] : '',
  }
}

export function groupLines(lines: readonly ActivityResult[], grouping: LineGrouping): LineSection[] {
  if (grouping === 'none') return [section('all', null, [...lines])]
  const keyOf = (r: ActivityResult) => (grouping === 'type' ? r.group.id : r.line.date.slice(0, 7))
  const groups = new Map<string, ActivityResult[]>()
  for (const r of lines) groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r])
  const sections = [...groups].map(([key, ls]) => {
    if (grouping === 'type') return section(key, ls[0].group.label, ls.sort((a, b) => byDate(a, b) || byType(a, b)))
    const [year, month] = key.split('-').map(Number)
    return section(key, monthLabel({ year, month }), ls.sort((a, b) => byType(a, b) || byDate(a, b)))
  })
  // Types alphabetically; months in date order.
  return sections.sort((a, b) => (grouping === 'type' ? a.label!.localeCompare(b.label!, 'da') : a.key.localeCompare(b.key)))
}
