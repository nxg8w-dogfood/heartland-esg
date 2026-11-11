// A company's fiscal periods (docs/adr/0013): named date ranges the app reports on. A period is
// a filter, like the original app's saved periods: lines keep their own dates and count for the
// share of their days inside the selected period (dates.ts). Deleting a period deletes no data.

import { dayValue, type Period } from './dates'

export type FiscalPeriod = Period & {
  id: string
  /** Shown in the period picker, e.g. "2025" or "2025/26" */
  name: string
}

const DAY_MS = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(dayValue(v)) && iso(dayValue(v)) === v

/** Periods by start date, oldest first. */
export const sortPeriods = (periods: readonly FiscalPeriod[]): FiscalPeriod[] =>
  [...periods].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.id.localeCompare(b.id))

/** The period that starts last; the default when a company is opened. */
export const latestPeriod = (periods: readonly FiscalPeriod[]): FiscalPeriod | undefined => sortPeriods(periods).at(-1)

/** The period with this id, or the latest one when it isn't among them. */
export const periodOrLatest = (periods: readonly FiscalPeriod[], id: string | undefined): FiscalPeriod | undefined =>
  periods.find((p) => p.id === id) ?? latestPeriod(periods)

/** Whether two periods share at least one day. Both ends are inclusive. */
export const overlaps = (a: Period, b: Period) => a.start <= b.end && b.start <= a.end

/**
 * What's wrong with a period among a company's other periods, in Danish for the UI, or null
 * when it's valid: a name that's set and not used by another period, two real dates, a start
 * before the end, and no day shared with another period.
 */
export function periodError(period: Omit<FiscalPeriod, 'id'> & { id?: string }, others: readonly FiscalPeriod[]): string | null {
  const rest = others.filter((o) => o.id !== period.id)
  const name = period.name.trim()
  if (!name) return 'Giv perioden et navn.'
  if (rest.some((o) => o.name.trim().toLowerCase() === name.toLowerCase())) return `Der er allerede en periode, der hedder ${name}.`
  if (!isIsoDate(period.start) || !isIsoDate(period.end)) return 'Angiv både en start- og en slutdato.'
  if (period.start >= period.end) return 'Startdatoen skal ligge før slutdatoen.'
  const clash = rest.find((o) => overlaps(period, o))
  if (clash) return `Perioden overlapper ${clash.name} (${formatRange(clash)}).`
  return null
}

/** The first error in a company's periods, or null. A company needs at least one period. */
export function periodsError(periods: readonly FiscalPeriod[]): string | null {
  if (periods.length === 0) return 'Virksomheden skal have mindst én periode.'
  for (const p of periods) {
    const e = periodError(p, periods)
    if (e) return `${p.name || 'En periode'}: ${e}`
  }
  return null
}

/**
 * A name for a date range: "2025" for a calendar year, "2025/26" for a twelve-month year that
 * starts on the first of another month, otherwise the dates.
 */
export function periodName({ start, end }: Period): string {
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  if (sm === 1 && sd === 1 && em === 12 && ed === 31 && sy === ey) return String(sy)
  if (sd === 1 && ey === sy + 1 && iso(dayValue(end) + DAY_MS) === `${ey}-${String(sm).padStart(2, '0')}-01`) {
    return `${sy}/${String(ey % 100).padStart(2, '0')}`
  }
  return formatRange({ start, end })
}

/** "1.1.2025–31.12.2025" */
export function formatRange({ start, end }: Period): string {
  const d = (v: string) => {
    const [y, m, day] = v.split('-').map(Number)
    return `${day}.${m}.${y}`
  }
  return `${d(start)}–${d(end)}`
}

/** The calendar year before `today`, the year a company typically reports on first. */
export function defaultPeriod(id: string, today = new Date()): FiscalPeriod {
  const year = today.getFullYear() - 1
  return { id, name: String(year), start: `${year}-01-01`, end: `${year}-12-31` }
}

/** A period made from a date range that was stored before periods existed. */
export const periodFromRange = (id: string, range: Period): FiscalPeriod => ({ id, name: periodName(range), start: range.start, end: range.end })

/**
 * The period after the latest one, as long as it: starting the day after it ends. Used by
 * "Tilføj periode", so the suggestion never overlaps. A company without periods gets last year.
 */
export function nextPeriod(id: string, periods: readonly FiscalPeriod[], today = new Date()): FiscalPeriod {
  const latest = sortPeriods(periods).reduce<FiscalPeriod | undefined>((a, p) => (!a || p.end > a.end ? p : a), undefined)
  if (!latest) return defaultPeriod(id, today)
  const start = iso(dayValue(latest.end) + DAY_MS)
  const [sy, sm, sd] = latest.start.split('-').map(Number)
  const [ny, nm, nd] = start.split('-').map(Number)
  // Same number of months when the latest period runs whole months, otherwise the same days.
  const lengthDays = Math.round((dayValue(latest.end) - dayValue(latest.start)) / DAY_MS) + 1
  const wholeMonths = sd === 1 && nd === 1
  const months = (ny - sy) * 12 + (nm - sm)
  const end = wholeMonths
    ? iso(Date.UTC(ny, nm - 1 + months, 1) - DAY_MS)
    : iso(dayValue(start) + (lengthDays - 1) * DAY_MS)
  const name = periodName({ start, end })
  const taken = new Set(periods.map((p) => p.name.trim().toLowerCase()))
  return { id, name: taken.has(name.toLowerCase()) ? formatRange({ start, end }) : name, start, end }
}
