// Date handling ported from the original app: dates are ISO strings (YYYY-MM-DD),
// compared as UTC midnights, and periods count whole days inclusive.

const DAY_MS = 86_400_000

/** UTC midnight of an ISO date, or NaN if missing or invalid. Anything after the date part is ignored. */
export function dayValue(date: string | null | undefined): number {
  return date ? Date.parse(`${date.slice(0, 10)}T00:00:00Z`) : Number.NaN
}

export type Period = { start: string; end: string }

export type Dated = {
  date: string
  /** Last day of a line that covers a range, e.g. a quarterly fuel bill */
  dateTo?: string | null
}

/**
 * Share of a line that falls inside the period, 0 to 1. A single-day line counts fully
 * if its date is inside. A range counts by the share of its days inside the period.
 * Invalid dates give 0, so a line with a bad date is left out rather than counted.
 */
export function periodShare(line: Dated, period: Period): number {
  const start = dayValue(period.start)
  const end = dayValue(period.end)
  const from = dayValue(line.date)
  if (Number.isNaN(from) || Number.isNaN(start) || Number.isNaN(end)) return 0

  const to = line.dateTo ? dayValue(line.dateTo) : from
  if (Number.isNaN(to) || to <= from) return from >= start && from <= end ? 1 : 0

  const overlapFrom = Math.max(from, start)
  const overlapTo = Math.min(to, end)
  if (overlapTo < overlapFrom) return 0
  const daysInside = Math.round((overlapTo - overlapFrom) / DAY_MS) + 1
  const daysTotal = Math.round((to - from) / DAY_MS) + 1
  return daysInside / daysTotal
}

// Annual figures (a commuting survey, an investee's emissions) stand for the calendar year
// they're dated in, and count for the share of that year inside the reporting period.

const daysBetween = (from: number, to: number) => Math.round((to - from) / DAY_MS) + 1

/** Share of a calendar year that falls in the period, 0 to 1. 0 for an invalid or reversed period. */
export function yearShare(year: number, period: Period): number {
  const start = dayValue(period.start)
  const end = dayValue(period.end)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0
  const yearStart = Date.UTC(year, 0, 1)
  const yearEnd = Date.UTC(year, 11, 31)
  const from = Math.max(start, yearStart)
  const to = Math.min(end, yearEnd)
  return to < from ? 0 : daysBetween(from, to) / daysBetween(yearStart, yearEnd)
}

/** The calendar years a period touches. */
export function periodYearsList(period: Period): number[] {
  const start = dayValue(period.start)
  const end = dayValue(period.end)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return []
  const first = new Date(start).getUTCFullYear()
  const last = new Date(end).getUTCFullYear()
  return Array.from({ length: last - first + 1 }, (_, i) => first + i)
}
