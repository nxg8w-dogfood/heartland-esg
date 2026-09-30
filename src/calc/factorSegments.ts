// Splits a line that spans a change of factor, so each part uses the factor valid on its
// own days. Example: an electricity bill from 1 Dec 2024 to 28 Feb 2025 uses the 2024 grid
// mix for its 31 December days and the 2025 mix for its 59 days in 2025.
//
// This deliberately differs from the original app, which used the factor valid on the
// line's start date for the whole line.

import type { Factor } from '../data/factors'
import { dayValue, periodShare, type Dated, type Period } from './dates'
import { findFactor } from './findFactor'

const DAY_MS = 86_400_000
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export type FactorSegment = {
  factor: Factor | null
  /** Share of the whole line that uses this factor. Shares add up to the line's period share. */
  share: number
}

export function factorSegments(
  factors: readonly Factor[],
  factorId: string | null | undefined,
  line: Dated,
  period: Period,
): FactorSegment[] {
  const total = periodShare(line, period)
  if (total === 0) return []

  const first = findFactor(factors, factorId, line.date)
  const from = dayValue(line.date)
  const to = line.dateTo ? dayValue(line.dateTo) : from
  // A single day, or a factor that never changes: one segment, as before.
  if (!first?.family || Number.isNaN(to) || to <= from) return [{ factor: first, share: total }]

  const overlapFrom = Math.max(from, dayValue(period.start))
  const overlapTo = Math.min(to, dayValue(period.end))
  const lineDays = Math.round((to - from) / DAY_MS) + 1

  // The factor can only change where a family member starts, or the day after one ends.
  const breaks = new Set<number>([overlapFrom])
  for (const f of factors) {
    if (f.family !== first.family) continue
    for (const edge of [dayValue(f.validFrom), dayValue(f.validTo) + DAY_MS]) {
      if (!Number.isNaN(edge) && edge > overlapFrom && edge <= overlapTo) breaks.add(edge)
    }
  }
  const starts = [...breaks].sort((a, b) => a - b)

  const segments: FactorSegment[] = []
  starts.forEach((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] - DAY_MS : overlapTo
    const factor = findFactor(factors, factorId, isoDay(start))
    const share = (Math.round((end - start) / DAY_MS) + 1) / lineDays
    const last = segments[segments.length - 1]
    if (last && last.factor?.id === factor?.id) last.share += share
    else segments.push({ factor, share })
  })
  return segments
}
