// Calendar months in Danish local time. Utility bills and the climate account count months
// from local midnight, so October starts at 2026-09-30T22:00Z (summer time) and ends at
// 2026-10-31T23:00Z (winter time).

import type { Period } from '../calc/dates'

const HOUR_MS = 3_600_000

const copenhagen = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Copenhagen',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** The local date and time in Copenhagen of a UTC instant, as `YYYY-MM-DD HH:mm`. */
export function copenhagenLocal(ms: number): string {
  const parts = Object.fromEntries(copenhagen.formatToParts(ms).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

/** UTC instant of local midnight in Copenhagen at the start of an ISO date. */
export function copenhagenMidnight(date: string): number {
  const utcMidnight = Date.parse(`${date.slice(0, 10)}T00:00:00Z`)
  // Denmark is UTC+1 in winter and UTC+2 in summer; midnight is never inside a DST change.
  for (const offset of [1, 2]) {
    const candidate = utcMidnight - offset * HOUR_MS
    if (copenhagenLocal(candidate) === `${date.slice(0, 10)} 00:00`) return candidate
  }
  throw new Error(`No local midnight found for ${date}`)
}

export type Month = {
  /** `YYYY-MM` */
  key: string
  /** First day, `YYYY-MM-DD` */
  first: string
  /** Last day, `YYYY-MM-DD` */
  last: string
  /** UTC instant of local midnight at the start of the month */
  startMs: number
  /** UTC instant of local midnight at the start of the next month */
  endMs: number
}

const pad = (n: number) => String(n).padStart(2, '0')

export function month(year: number, monthIndex: number): Month {
  const first = `${year}-${pad(monthIndex + 1)}-01`
  const next = new Date(Date.UTC(year, monthIndex + 1, 1))
  const nextFirst = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-01`
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  return {
    key: first.slice(0, 7),
    first,
    last: `${first.slice(0, 8)}${pad(lastDay)}`,
    startMs: copenhagenMidnight(first),
    endMs: copenhagenMidnight(nextFirst),
  }
}

/**
 * The months touching the period that have ended by `nowMs`. A month still in progress is
 * left out, because its consumption isn't complete.
 */
export function completedMonths(period: Period, nowMs: number): Month[] {
  const [sy, sm] = period.start.split('-').map(Number)
  const [ey, em] = period.end.split('-').map(Number)
  if (![sy, sm, ey, em].every(Number.isFinite)) return []
  const months: Month[] = []
  for (let y = sy, m = sm - 1; y < ey || (y === ey && m <= em - 1); m === 11 ? (y++, (m = 0)) : m++) {
    const mo = month(y, m)
    if (mo.endMs <= nowMs) months.push(mo)
  }
  return months
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('da-DK', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, 1))
}
