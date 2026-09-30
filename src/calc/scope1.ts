// Scope 1: direct emissions from sources the company owns or controls.
// The groups and their factors are the original app's, one for one.

import type { Factor } from '../data/factors'
import { periodShare, type Period } from './dates'
import { factorSegments } from './factorSegments'
import { findFactor } from './findFactor'
import { lineEmissions, type LineResult } from './lineEmissions'

export const scope1Groups = [
  { id: 's1-diesel', label: 'Firmabiler – diesel', unit: 'liter', factorId: 'f-s1-diesel', kind: 'mobile' },
  { id: 's1-benzin', label: 'Firmabiler – benzin', unit: 'liter', factorId: 'f-s1-benzin', kind: 'mobile' },
  { id: 's1-naturgas', label: 'Opvarmning – naturgas', unit: 'm³', factorId: 'f-s1-naturgas', kind: 'stationary' },
  { id: 's1-gasolie', label: 'Opvarmning – fyringsgasolie', unit: 'liter', factorId: 'f-s1-gasolie', kind: 'stationary' },
  { id: 's1-hfc134a', label: 'Kølemiddel HFC-134a', unit: 'kg', factorId: 'f-s1-hfc134a', kind: 'fugitive' },
  { id: 's1-koel-andet', label: 'Andet kølemiddel', unit: 'kg', factorId: 'f-s1-koel-andet', kind: 'fugitive' },
] as const

export type Scope1Group = (typeof scope1Groups)[number]
export type Scope1GroupId = Scope1Group['id']

export type Scope1Line = {
  id: string
  group: Scope1GroupId
  date: string
  dateTo?: string | null
  /** In the group's unit */
  quantity: number | null
  /** kg CO2e per unit, overriding the table factor */
  customFactor?: number | null
  description?: string
}

export type Scope1LineResult = LineResult & {
  line: Scope1Line
  group: Scope1Group
  factor: Factor | null
  /** The factor value actually used: the custom factor if set, else the table's */
  factorValue: number | null
  share: number
}

export type Scope1Summary = {
  lines: Scope1LineResult[]
  total: number
  mobile: number
  stationary: number
  fugitive: number
  pendingCount: number
}

export function scope1Line(
  line: Scope1Line,
  factors: readonly Factor[],
  period: Period,
): Scope1LineResult {
  const group = scope1Groups.find((g) => g.id === line.group)
  if (!group) throw new Error(`Unknown Scope 1 group: ${line.group}`)
  const share = periodShare(line, period)
  const emissions = (factor: Factor | null, part: number) =>
    lineEmissions(
      {
        method: 'activity',
        quantity: line.quantity,
        unit: group.unit,
        factor: factor ? { value: factor.value, unit: factor.unit } : null,
        customFactor: line.customFactor,
      },
      part,
    )

  // A line spanning a change of factor (e.g. two BEIS years) is split, each part with its own factor.
  const segments = factorSegments(factors, group.factorId, line, period)
  if (segments.length <= 1) {
    const factor = segments[0]?.factor ?? findFactor(factors, group.factorId, line.date)
    return { ...emissions(factor, share), line, group, factor, factorValue: line.customFactor ?? factor?.value ?? null, share }
  }

  const parts = segments.map((s) => emissions(s.factor, s.share))
  const tCO2e = parts.reduce((t, p) => t + p.tCO2e, 0)
  const quantityInPeriod = line.quantity === null || parts.some((p) => p.quantityInPeriod === null)
    ? null
    : parts.reduce((t, p) => t + (p.quantityInPeriod ?? 0), 0)
  const largest = [...segments].sort((a, b) => b.share - a.share)[0]
  return {
    tCO2e,
    quantityInPeriod,
    pending: parts.some((p) => p.pending),
    warning: parts.find((p) => p.warning)?.warning ?? null,
    line,
    group,
    factor: largest.factor,
    // The weighted average of the parts, so quantity × factor still gives the total.
    factorValue:
      line.customFactor ??
      (quantityInPeriod ? (tCO2e * 1000) / quantityInPeriod : (largest.factor?.value ?? null)),
    share,
  }
}

/** Lines outside the period are left out of the summary, but not deleted. */
export function scope1Summary(
  lines: readonly Scope1Line[],
  factors: readonly Factor[],
  period: Period,
): Scope1Summary {
  const results = lines
    .map((line) => scope1Line(line, factors, period))
    .filter((r) => r.share > 0)
  const sum = (kind?: Scope1Group['kind']) =>
    results.filter((r) => !kind || r.group.kind === kind).reduce((t, r) => t + r.tCO2e, 0)
  return {
    lines: results,
    total: sum(),
    mobile: sum('mobile'),
    stationary: sum('stationary'),
    fugitive: sum('fugitive'),
    pendingCount: results.filter((r) => r.pending).length,
  }
}
