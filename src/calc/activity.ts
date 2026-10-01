// Activity-based lines: quantity × emission factor ÷ 1,000 = tCO2e. Used by Scope 1 and by
// the Scope 3 categories entered as activity data (waste, business travel). Ported from the
// original app's per-line calculation, which it shared between them in the same way.

import type { Factor } from '../data/factors'
import { periodShare, type Period } from './dates'
import { factorSegments } from './factorSegments'
import { findFactor } from './findFactor'
import { lineEmissions, type LineResult } from './lineEmissions'

export type ActivityGroup = {
  id: string
  label: string
  /** The unit quantities are entered in, e.g. "liter" or "passagerkm" */
  unit: string
  /** The factor a new line starts with */
  factorId: string
  /** If set, a line may use any factor in this factor-table category instead, e.g. hotel countries */
  factorChoices?: string
}

export type ActivityLine = {
  id: string
  group: string
  date: string
  dateTo?: string | null
  /** In the group's unit */
  quantity: number | null
  /** Overrides the group's factor; must be one of its choices */
  factorId?: string | null
  /** kg CO2e per unit, overriding the table factor */
  customFactor?: number | null
  description?: string
}

export type ActivityResult<G extends ActivityGroup = ActivityGroup, L extends ActivityLine = ActivityLine> = LineResult & {
  line: L
  group: G
  factor: Factor | null
  /** The factor value used: the custom factor if set, else the table's (a weighted average if split) */
  factorValue: number | null
  share: number
}

/** The factors a line in this group may use. Always includes the group's default. */
export function factorOptions(group: ActivityGroup, factors: readonly Factor[]): Factor[] {
  const own = factors.filter((f) => f.id === group.factorId)
  if (!group.factorChoices) return own
  return [...own, ...factors.filter((f) => f.category === group.factorChoices && f.id !== group.factorId)]
}

export function activityLine<G extends ActivityGroup, L extends ActivityLine>(
  line: L,
  group: G,
  factors: readonly Factor[],
  period: Period,
): ActivityResult<G, L> {
  const factorId = line.factorId ?? group.factorId
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
  const segments = factorSegments(factors, factorId, line, period)
  if (segments.length <= 1) {
    const factor = segments[0]?.factor ?? findFactor(factors, factorId, line.date)
    return { ...emissions(factor, share), line, group, factor, factorValue: line.customFactor ?? factor?.value ?? null, share }
  }

  const parts = segments.map((s) => emissions(s.factor, s.share))
  const tCO2e = parts.reduce((t, p) => t + p.tCO2e, 0)
  const quantityInPeriod =
    line.quantity === null || parts.some((p) => p.quantityInPeriod === null)
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

export type ActivitySummary<G extends ActivityGroup = ActivityGroup, L extends ActivityLine = ActivityLine> = {
  lines: ActivityResult<G, L>[]
  total: number
  pendingCount: number
}

/** Lines outside the period are left out, but not deleted. A line with an unknown group throws. */
export function activitySummary<G extends ActivityGroup, L extends ActivityLine>(
  lines: readonly L[],
  groups: readonly G[],
  factors: readonly Factor[],
  period: Period,
): ActivitySummary<G, L> {
  const results = lines
    .map((line) => {
      const group = groups.find((g) => g.id === line.group)
      if (!group) throw new Error(`Unknown group: ${line.group}`)
      return activityLine(line, group, factors, period)
    })
    .filter((r) => r.share > 0)
  return {
    lines: results,
    total: results.reduce((t, r) => t + r.tCO2e, 0),
    pendingCount: results.filter((r) => r.pending).length,
  }
}
