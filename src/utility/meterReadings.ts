// Monthly consumption from a meter that counts up (a district-heating energy register).
// Consumption for a month = the reading at local midnight starting the next month minus the
// reading at local midnight starting this month.

import type { Month } from './months'

export type Reading = { ms: number; value: number }

export type ReadingAt = { value: number; estimated: boolean }

/** Round away floating-point noise; meters resolve to 0.1 kWh, i.e. 0.0001 MWh. */
export const roundReading = (v: number) => Math.round(v * 10_000) / 10_000

/** Sort by time and drop repeated timestamps (the Varmeoverblik API returns each one twice). */
export function dedupeReadings(readings: readonly Reading[]): Reading[] {
  const byTime = new Map<number, Reading>()
  for (const r of readings) {
    if (Number.isFinite(r.ms) && Number.isFinite(r.value) && !byTime.has(r.ms)) byTime.set(r.ms, { ms: r.ms, value: roundReading(r.value) })
  }
  return [...byTime.values()].sort((a, b) => a.ms - b.ms)
}

/**
 * The reading at an instant: exact if there is one, otherwise interpolated linearly between
 * the nearest readings on each side and marked as estimated. Null without readings on both sides.
 */
export function readingAt(readings: readonly Reading[], ms: number): ReadingAt | null {
  let before: Reading | null = null
  let after: Reading | null = null
  for (const r of readings) {
    if (r.ms === ms) return { value: r.value, estimated: false }
    if (r.ms < ms && (!before || r.ms > before.ms)) before = r
    if (r.ms > ms && (!after || r.ms < after.ms)) after = r
  }
  if (!before || !after) return null
  const share = (ms - before.ms) / (after.ms - before.ms)
  return { value: roundReading(before.value + (after.value - before.value) * share), estimated: true }
}

export type MonthlyConsumption = {
  month: Month
  /** In the register's unit; null when a boundary reading is missing */
  quantity: number | null
  estimated: boolean
  /** The meter went backwards: replaced or reset. Needs checking by hand. */
  negative: boolean
  missing: boolean
}

export function monthlyFromReadings(readings: readonly Reading[], months: readonly Month[]): MonthlyConsumption[] {
  const sorted = dedupeReadings(readings)
  return months.map((month) => {
    const start = readingAt(sorted, month.startMs)
    const end = readingAt(sorted, month.endMs)
    if (!start || !end) return { month, quantity: null, estimated: false, negative: false, missing: true }
    const quantity = roundReading(end.value - start.value)
    return { month, quantity, estimated: start.estimated || end.estimated, negative: quantity < 0, missing: false }
  })
}
