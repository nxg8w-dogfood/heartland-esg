// Reads an export from the group's consolidation system (docs/adr/0017). Each export is one
// measure for every legal entity, with a column per period:
//
//   InternalExternal    Intern
//   Measures            Value DKK
//   Time Calculations   YTD
//   Analysis            Actual
//   Account Internal    Ownership Percentage (CL)   <- which measure this file holds
//
//                       Year-Month
//   FriendlyName        July 2025     July 2026     <- the row dimension, then the periods
//   Alfa Holding        1,00          1,00
//
// The app only reads what it needs: the measure, the period columns and one value per entity.
// Everything else in the header block is kept for display, so the user can see what they picked
// in the source system.

import type { CellValue } from './ledger'
import { parseLedgerAmount, parseLedgerDate } from './ledger'

/** The measures the app can use. 'unknown' keeps the text, so the file can still be described. */
export type GroupMeasure = 'ownership' | 'turnover' | 'investment' | 'unknown'

export const measureLabels: Record<GroupMeasure, string> = {
  ownership: 'Ejerandel',
  turnover: 'Nettoomsætning',
  investment: 'Investeringsbeløb',
  unknown: 'Ukendt nøgletal',
}

export type GroupPeriod = { label: string; year: number; month: number }

export type GroupExportRow = {
  /** The entity, as the source system writes it */
  name: string
  /** One value per period, in the same order; null where the cell is empty */
  values: (number | null)[]
}

export type GroupExport = {
  measure: GroupMeasure
  /** What `Account Internal` said, as written */
  measureText: string
  /** The header block, e.g. Measures → "Value DKK" */
  settings: { label: string; value: string }[]
  /** The row dimension, e.g. "FriendlyName" */
  dimension: string
  periods: GroupPeriod[]
  rows: GroupExportRow[]
  /** Entities skipped because every period was empty (parent rows in the hierarchy) */
  skipped: number
}

const monthNames = [
  ['january', 'januar', 'jan'],
  ['february', 'februar', 'feb'],
  ['march', 'marts', 'mar'],
  ['april', 'apr'],
  ['may', 'maj'],
  ['june', 'juni', 'jun'],
  ['july', 'juli', 'jul'],
  ['august', 'aug'],
  ['september', 'sep', 'sept'],
  ['october', 'oktober', 'okt'],
  ['november', 'nov'],
  ['december', 'dec'],
]

const text = (v: CellValue): string => (v instanceof Date ? parseLedgerDate(v) : v == null ? '' : String(v)).trim()

/** "July 2025", "juli 2025", "2025-07" or a date cell as a year and month. */
export function parsePeriodLabel(v: CellValue): GroupPeriod | null {
  const raw = text(v)
  if (!raw) return null
  const iso = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(raw)
  if (iso) {
    const month = Number(iso[2])
    return month >= 1 && month <= 12 ? { label: raw, year: Number(iso[1]), month } : null
  }
  const named = /^([A-Za-zÆØÅæøå.]+)\s+(\d{4})$/.exec(raw)
  if (named) {
    const name = named[1].replace(/\.$/, '').toLowerCase()
    const i = monthNames.findIndex((names) => names.includes(name))
    if (i !== -1) return { label: raw, year: Number(named[2]), month: i + 1 }
  }
  const numeric = /^(\d{1,2})[./](\d{4})$/.exec(raw)
  if (numeric) {
    const month = Number(numeric[1])
    return month >= 1 && month <= 12 ? { label: raw, year: Number(numeric[2]), month } : null
  }
  return null
}

export function measureOf(accountInternal: string): GroupMeasure {
  if (/ownership\s*percentage|ejerandel/i.test(accountInternal)) return 'ownership'
  if (/net\s*turnover|nettoomsætning|omsætning/i.test(accountInternal)) return 'turnover'
  if (/investment\s*amount|investeringsbeløb/i.test(accountInternal)) return 'investment'
  return 'unknown'
}

export class GroupExportError extends Error {}

/**
 * Reads one export. Throws GroupExportError when the layout isn't one, so the UI can say what's
 * wrong instead of importing nonsense.
 */
export function parseGroupExport(grid: readonly (readonly CellValue[])[]): GroupExport {
  // The header row is the first row with a label in the first cell and at least one period after
  // it. The header block is everything above; the entities everything below.
  let headerAt = -1
  let periods: GroupPeriod[] = []
  let valueColumns: number[] = []
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]
    if (!text(row[0])) continue
    const found: { column: number; period: GroupPeriod }[] = []
    for (let c = 1; c < row.length; c++) {
      const period = parsePeriodLabel(row[c])
      if (period) found.push({ column: c, period })
    }
    if (found.length) {
      headerAt = r
      periods = found.map((f) => f.period)
      valueColumns = found.map((f) => f.column)
      break
    }
  }
  if (headerAt === -1) throw new GroupExportError('Filen har ingen periodekolonner (fx “July 2025”). Er det en eksport fra koncernsystemet?')

  const settings: { label: string; value: string }[] = []
  for (let r = 0; r < headerAt; r++) {
    const label = text(grid[r][0])
    const value = grid[r].slice(1).map(text).find(Boolean) ?? ''
    if (label && value && !parsePeriodLabel(value)) settings.push({ label, value })
  }
  const measureText = settings.find((s) => /account\s*internal/i.test(s.label))?.value ?? ''
  if (!measureText) throw new GroupExportError('Filen mangler “Account Internal”, så det er uklart hvilket nøgletal den indeholder.')

  const rows: GroupExportRow[] = []
  let skipped = 0
  for (let r = headerAt + 1; r < grid.length; r++) {
    const name = text(grid[r][0])
    if (!name) continue
    const values = valueColumns.map((c) => parseLedgerAmount(grid[r][c] ?? null))
    if (values.every((v) => v === null || v === 0)) { skipped++; continue }
    rows.push({ name, values })
  }
  if (rows.length === 0) throw new GroupExportError('Filen indeholder ingen selskaber med værdier.')

  return { measure: measureOf(measureText), measureText, settings, dimension: text(grid[headerAt][0]), periods, rows, skipped }
}

/**
 * Ownership as a percentage. The system writes a share (1,00 for a wholly owned company), but
 * an export set to percent writes 100. Everything at or below 1 is read as a share.
 */
export function ownershipScale(values: readonly (number | null)[]): { factor: 1 | 100; asShare: boolean } {
  const asShare = values.every((v) => v === null || Math.abs(v) <= 1)
  return { factor: asShare ? 100 : 1, asShare }
}

/** Income is a credit in the source system, so it arrives negative. */
export const turnoverToRevenue = (value: number) => -value

/** What importing one company from the export would do. */
export type PlanStatus = 'new' | 'update' | 'consolidated' | 'unknownShare'

export const planStatusLabels: Record<PlanStatus, string> = {
  new: 'Ny investering',
  update: 'Opdateres',
  consolidated: 'Konsolideret — ikke kategori 15',
  unknownShare: 'Ingen ejerandel',
}

export type PlanRow = {
  name: string
  /** 0–100, from the ownership export */
  ownershipPct: number | null
  /** DKK, the credit from the turnover export turned into revenue */
  revenueDKK: number | null
  /** DKK, for information only: the app doesn't calculate from an investment amount */
  investmentDKK: number | null
  /** The investment this updates: the same company, dated in the same year */
  existingId: string | null
  status: PlanStatus
}

const sameCompany = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Holdings above this are consolidated into Scope 1 and 2, not counted in category 15. */
export const CONSOLIDATED_ABOVE_PCT = 50

/**
 * What the chosen period of the given exports would add to or change in category 15. Companies
 * appear in the order the exports list them; a company above the consolidation threshold is
 * shown but not imported.
 */
export function planInvestments(
  exports: readonly GroupExport[],
  periodLabel: string,
  existing: readonly { id: string; company: string; date: string }[],
): PlanRow[] {
  // Each holding stands for a calendar year, so a company already in another year is a new row.
  const year = exports.flatMap((e) => e.periods).find((p) => p.label === periodLabel)?.year ?? null
  const valueOf = (measure: GroupMeasure, name: string): number | null => {
    for (const e of exports) {
      if (e.measure !== measure) continue
      const i = e.periods.findIndex((p) => p.label === periodLabel)
      if (i === -1) continue
      const row = e.rows.find((r) => sameCompany(r.name, name))
      if (row && row.values[i] != null) return row.values[i]
    }
    return null
  }
  const ownershipValues = exports.filter((e) => e.measure === 'ownership').flatMap((e) => e.rows.flatMap((r) => r.values))
  const { factor } = ownershipScale(ownershipValues)

  const names: string[] = []
  for (const e of exports) for (const r of e.rows) if (!names.some((n) => sameCompany(n, r.name))) names.push(r.name)

  return names.map((name) => {
    const share = valueOf('ownership', name)
    const ownershipPct = share === null ? null : share * factor
    const turnover = valueOf('turnover', name)
    const row = {
      name,
      ownershipPct,
      revenueDKK: turnover === null ? null : turnoverToRevenue(turnover),
      investmentDKK: valueOf('investment', name),
      existingId: existing.find((i) => sameCompany(i.company, name) && i.date.startsWith(`${year}-`))?.id ?? null,
    }
    if (ownershipPct === null) return { ...row, status: 'unknownShare' as const }
    if (ownershipPct > CONSOLIDATED_ABOVE_PCT) return { ...row, status: 'consolidated' as const }
    return { ...row, status: row.existingId ? ('update' as const) : ('new' as const) }
  })
}

/** The last day of an export period: the date an imported holding is given. */
export function periodEndDate(period: GroupPeriod): string {
  const day = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate()
  return `${period.year}-${String(period.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
