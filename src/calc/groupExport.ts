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
//
// The cube's company table is read too (docs/adr/0025): one row per company, keyed by
// OrganizationID, with a column per measure. See parseCompanyTable.

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
  /** The company's key in the cube (OrganizationID), when the export has one */
  id?: string
  /** How the cube classes the holding: Subsidiary, Associated, Other, Cost … */
  ownershipType?: string
  /** The company's business area in the cube, e.g. Apparel */
  businessArea?: string
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
  if (/net\s*turnover|nettoomsætning|omsætning|revenue/i.test(accountInternal)) return 'turnover'
  if (/investment\s*amount|investeringsbeløb/i.test(accountInternal)) return 'investment'
  return 'unknown'
}

export class GroupExportError extends Error {}

/**
 * Rows the cube adds that aren't entities: "Not Available" collects values with no entity, and
 * "(Transactions on …)" is a parent's own postings in the hierarchy.
 */
const isPlaceholder = (name: string) => /^(group\s+)?not available$/i.test(name) || /^\(transactions on /i.test(name)

/**
 * Reads one export. Throws GroupExportError when the layout isn't one, so the UI can say what's
 * wrong instead of importing nonsense.
 */
export function parseGroupExport(sheet: readonly (readonly CellValue[])[]): GroupExport {
  // An export saved from the Excel add-in starts at C3, not A1: drop the empty columns in front.
  const first = Math.min(...sheet.map((row) => { const i = row.findIndex((v) => text(v) !== ''); return i === -1 ? Infinity : i }))
  const grid = Number.isFinite(first) && first > 0 ? sheet.map((row) => row.slice(first)) : sheet
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
    if (isPlaceholder(name)) { skipped++; continue }
    const values = valueColumns.map((c) => parseLedgerAmount(grid[r][c] ?? null))
    if (values.every((v) => v === null || v === 0)) { skipped++; continue }
    rows.push({ name, values })
  }
  if (rows.length === 0) throw new GroupExportError('Filen indeholder ingen selskaber med værdier.')

  return { measure: measureOf(measureText), measureText, settings, dimension: text(grid[headerAt][0]), periods, rows, skipped }
}

/** The first month a heading names, e.g. "juli 2026" in "Revenue juli 2026 (DKK)" */
function periodIn(heading: string): GroupPeriod | null {
  for (const m of heading.matchAll(/([A-Za-zÆØÅæøå]+)\.?\s+(\d{4})/g)) {
    const period = parsePeriodLabel(`${m[1]} ${m[2]}`)
    if (period) return period
  }
  return null
}

const isOrganizationId = (heading: string) => /^organi[sz]ation\s*id$/i.test(heading)
/** "N/A", "NA" and "Not Available" are the cube's way of saying nothing */
const known = (value: string) => (/^(n\/?a|not available)$/i.test(value) ? '' : value)

/**
 * Reads a sheet of the cube's company table (docs/adr/0025): one row per company, keyed by
 * OrganizationID, with a column per measure whose heading names the month:
 *
 *   OrganizationID  Selskabsnavn (OrganizationName)  FriendlyName  OwnershipType  BusinessArea  Revenue juli 2026 (DKK)  Ejerandel juli 2026
 *   401_464         Zalando SE                       Zalando       Associated     Apparel       100937926370,37          0,11425
 *
 * Each measure column becomes an export of its own, so the rest of the import treats it as one
 * from the cube. Revenue here is already positive. Null when the sheet has no OrganizationID
 * column, so the caller can try the cube's layout.
 */
export function parseCompanyTable(sheet: readonly (readonly CellValue[])[]): GroupExport[] | null {
  const headerAt = sheet.findIndex((row) => row.some((v) => isOrganizationId(text(v))))
  if (headerAt === -1) return null
  const headings = sheet[headerAt].map(text)
  const column = (re: RegExp) => headings.findIndex((h) => re.test(h))
  const idColumn = headings.findIndex(isOrganizationId)
  const friendlyColumn = column(/^friendly\s*name$/i)
  const nameColumn = column(/organi[sz]ation\s*name/i)
  const typeColumn = column(/^ownership\s*type$/i)
  const areaColumn = column(/^business\s*area$/i)
  const cell = (row: readonly CellValue[], c: number) => (c === -1 ? '' : known(text(row[c])))

  // The title above the table says the month and whether it's year to date.
  const above = sheet.slice(0, headerAt).flatMap((row) => row.map(text)).filter(Boolean)
  const settings = above.length ? [{ label: 'Titel', value: above[0] }] : []
  if (above.some((t) => /\bytd\b/i.test(t))) settings.push({ label: 'Time Calculations', value: 'YTD' })
  const measures = headings.flatMap((heading, c) => {
    const measure = measureOf(heading)
    const period = periodIn(heading) ?? above.map(periodIn).find((p) => p !== null) ?? null
    return measure !== 'unknown' && !/ownership\s*type/i.test(heading) && period ? [{ c, measure, heading, period }] : []
  })
  if (measures.length === 0) {
    throw new GroupExportError('Tabellen har OrganizationID, men ingen kolonne med ejerandel, omsætning eller investeringsbeløb for en måned (fx “Ejerandel juli 2026”).')
  }

  const companies = sheet.slice(headerAt + 1).flatMap((row) => {
    const id = text(row[idColumn])
    if (!id) return []
    // FriendlyName can be shared (dozens are "Not Available"); the legal name tells those apart.
    const name = cell(row, friendlyColumn) || cell(row, nameColumn) || id
    return [{ row, id, name, ownershipType: cell(row, typeColumn), businessArea: cell(row, areaColumn) }]
  })
  const exports = measures.map(({ c, measure, heading, period }): GroupExport => {
    const rows: GroupExportRow[] = []
    for (const { row, ...company } of companies) {
      const value = parseLedgerAmount(row[c] ?? null)
      if (value !== null && value !== 0) rows.push({ ...company, values: [value] })
    }
    return { measure, measureText: heading, settings, dimension: 'OrganizationID', periods: [period], rows, skipped: companies.length - rows.length }
  }).filter((e) => e.rows.length > 0)
  if (exports.length === 0) throw new GroupExportError('Filen indeholder ingen selskaber med værdier.')
  return exports
}

/** Every export a sheet holds: one per measure of a company table, or the cube's one. */
export const parseGroupExports = (sheet: readonly (readonly CellValue[])[]): GroupExport[] =>
  parseCompanyTable(sheet) ?? [parseGroupExport(sheet)]

/**
 * Ownership as a percentage. The system writes a share (1,00 for a wholly owned company), but
 * an export set to percent writes 100. The export is read as shares when most values are at
 * most 1, so one odd row (a total, say) can't turn every 100 % holding into 1 %.
 */
export function ownershipScale(values: readonly (number | null)[]): { factor: 1 | 100; asShare: boolean } {
  const known = values.filter((v): v is number => v !== null)
  const atMostOne = known.filter((v) => Math.abs(v) <= 1).length
  const asShare = atMostOne >= known.length - atMostOne
  return { factor: asShare ? 100 : 1, asShare }
}

/** Income is a credit in the source system, so it arrives negative. */
export const turnoverToRevenue = (value: number) => -value

/**
 * What turns an export's turnover into revenue: −1 for the cube's own export, where income is a
 * credit, 1 for the company table, which has turned it already. Read from the values, since a
 * few companies can have the other sign.
 */
export function revenueSign(values: readonly (number | null)[]): 1 | -1 {
  const negative = values.filter((v) => v !== null && v < 0).length
  const positive = values.filter((v) => v !== null && v > 0).length
  return negative >= positive ? -1 : 1
}

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
  /** OrganizationID, from a company table; null from the cube's own export */
  organizationId: string | null
  /** As the cube classes the holding, e.g. Associated; '' when the export doesn't say */
  ownershipType: string
  businessArea: string
  /** 0–100, from the ownership export */
  ownershipPct: number | null
  /** DKK, the turnover export as revenue */
  revenueDKK: number | null
  /** DKK, the amount invested: the data manual's basis (docs/adr/0022) */
  investmentDKK: number | null
  /** The investment this updates: the same company (by OrganizationID if both have one), on the same date */
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
  existing: readonly { id: string; company: string; date: string; organizationId?: string }[],
): PlanRow[] {
  // A holding covers the 12 months up to its date (docs/adr/0023), and an imported one is dated
  // at the end of its period. The same company on the same date is the same holding; any other
  // date is a new row, and an overlap is flagged in category 15.
  const period = exports.flatMap((e) => e.periods).find((p) => p.label === periodLabel)
  const date = period ? periodEndDate(period) : null
  // A company table's rows are matched on OrganizationID (docs/adr/0025), the cube's own export
  // on the name.
  const keyOf = (r: GroupExportRow) => (r.id ? `id:${r.id}` : `name:${r.name.trim().toLowerCase()}`)
  const signs = new Map(exports.filter((e) => e.measure === 'turnover').map((e) => [e, revenueSign(e.rows.flatMap((r) => r.values))]))
  /** The value for the period, with turnover as revenue */
  const valueOf = (measure: GroupMeasure, key: string): number | null => {
    for (const e of exports) {
      if (e.measure !== measure) continue
      const i = e.periods.findIndex((p) => p.label === periodLabel)
      if (i === -1) continue
      const value = e.rows.find((r) => keyOf(r) === key)?.values[i]
      if (value != null) return value * (signs.get(e) ?? 1)
    }
    return null
  }
  const ownershipValues = exports.filter((e) => e.measure === 'ownership').flatMap((e) => e.rows.flatMap((r) => r.values))
  const { factor } = ownershipScale(ownershipValues)

  const companies = new Map<string, GroupExportRow>()
  for (const e of exports) for (const r of e.rows) if (!companies.has(keyOf(r))) companies.set(keyOf(r), r)

  return [...companies].map(([key, { name, id, ownershipType, businessArea }]) => {
    const share = valueOf('ownership', key)
    // What's left of a sold holding can be a rounding residue, even below zero: no holding.
    const ownershipPct = share === null || Math.round(share * factor * 1e4) <= 0 ? null : share * factor
    const same = (i: (typeof existing)[number]) => (id && i.organizationId ? i.organizationId === id : sameCompany(i.company, name))
    const row = {
      name,
      organizationId: id ?? null,
      ownershipType: ownershipType ?? '',
      businessArea: businessArea ?? '',
      ownershipPct,
      revenueDKK: valueOf('turnover', key),
      investmentDKK: valueOf('investment', key),
      existingId: existing.find((i) => same(i) && i.date === date)?.id ?? null,
    }
    if (ownershipPct === null) return { ...row, status: 'unknownShare' as const }
    if (ownershipPct > CONSOLIDATED_ABOVE_PCT) return { ...row, status: 'consolidated' as const }
    return { ...row, status: row.existingId ? ('update' as const) : ('new' as const) }
  })
}

/** The cube's Associated is the app's associate; everything else is another investment. */
export const importedAccountingMethod = (row: Pick<PlanRow, 'ownershipType'>): 'Ass.' | 'Other investments' =>
  /^associated?$/i.test(row.ownershipType) ? 'Ass.' : 'Other investments'

/**
 * The basis a new holding gets. The data manual estimates a company without a climate account
 * from the amount invested (docs/adr/0022), so that's used when the export has a positive one;
 * otherwise revenue, as the original did.
 */
export const importedBasis = (row: Pick<PlanRow, 'investmentDKK'>): 'Investment' | 'Revenue' =>
  row.investmentDKK !== null && row.investmentDKK > 0 ? 'Investment' : 'Revenue'

/** The last day of an export period: the date an imported holding is given. */
export function periodEndDate(period: GroupPeriod): string {
  const day = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate()
  return `${period.year}-${String(period.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Stamped on every holding an import creates or updates, followed by the export's period */
export const IMPORT_SOURCE_PREFIX = 'Koncernsystem, '

export type ImportedBatch = {
  /** The holdings' data source, e.g. "Koncernsystem, July 2026" */
  source: string
  /** The export's period, e.g. "July 2026" */
  periodLabel: string
  ids: string[]
}

/** The imports the holdings came from, one per export period, in the order first seen. */
export function importedBatches(investments: readonly { id: string; dataSource: string }[]): ImportedBatch[] {
  const batches = new Map<string, ImportedBatch>()
  for (const inv of investments) {
    if (!inv.dataSource.startsWith(IMPORT_SOURCE_PREFIX)) continue
    const batch = batches.get(inv.dataSource) ?? { source: inv.dataSource, periodLabel: inv.dataSource.slice(IMPORT_SOURCE_PREFIX.length), ids: [] }
    batch.ids.push(inv.id)
    batches.set(inv.dataSource, batch)
  }
  return [...batches.values()]
}
