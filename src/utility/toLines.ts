// Turns fetched monthly consumption into Scope 2 lines, one per meter and month.

import type { Scope2Kind, Scope2Line } from '../calc/scope2'
import { monthLabel, type Month } from './months'

export type MonthlyFigure = { month: Month; kWh: number | null; estimated?: boolean; negative?: boolean; missing: boolean }

export type ImportPlan = {
  lines: Omit<Scope2Line, 'id'>[]
  /** This meter's month is already imported */
  duplicates: number
  /** Imported, but another line for the same location and type covers part of the month, e.g. a bill typed in by hand */
  overlaps: string[]
  /** Missing readings, or a meter that went backwards: left out, to be entered by hand */
  skipped: { month: string; reason: string }[]
}

const ESTIMATED = ' (anslået: interpoleret måling)'

/** The meter's own earlier imports are recognised by their description, which starts with the source. */
const fromSource = (line: Pick<Scope2Line, 'description'>, source: string) =>
  line.description === source || line.description === `${source}${ESTIMATED}`

export function planImport(
  existing: readonly Pick<Scope2Line, 'locationId' | 'kind' | 'date' | 'dateTo' | 'description'>[],
  locationId: string,
  kind: Scope2Kind,
  source: string,
  months: readonly MonthlyFigure[],
): ImportPlan {
  const same = existing.filter((l) => l.locationId === locationId && l.kind === kind)
  const plan: ImportPlan = { lines: [], duplicates: 0, overlaps: [], skipped: [] }
  for (const m of months) {
    const label = monthLabel(m.month.key)
    if (m.missing || m.kWh === null) {
      plan.skipped.push({ month: label, reason: 'mangler måling' })
      continue
    }
    if (m.negative) {
      plan.skipped.push({ month: label, reason: 'måleren gik baglæns (udskiftet eller nulstillet?)' })
      continue
    }
    const covering = same.filter((l) => l.date <= m.month.last && (l.dateTo || l.date) >= m.month.first)
    if (covering.some((l) => fromSource(l, source))) {
      plan.duplicates++
      continue
    }
    if (covering.length) plan.overlaps.push(label)
    plan.lines.push({
      locationId,
      kind,
      date: m.month.first,
      dateTo: m.month.last,
      kWh: m.kWh,
      description: `${source}${m.estimated ? ESTIMATED : ''}`,
    })
  }
  return plan
}
