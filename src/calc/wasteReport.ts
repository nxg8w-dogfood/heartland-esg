// Category 5 from the waste hauler's quantity report (Marius Pedersen, "Mængderapport - pr.
// affaldstype"). One sheet, one row per waste type and treatment, one column per activity month:
//
//   Periode:
//   aug 2025 - jul 2026                         <- the period; month 1 is its first month
//   Mængderapport - pr. affaldstype
//                                Periode   Aktivitets mdr.
//   Affaldstype   Behandlingsform  1    2    3   …   12
//   Bølgepap      Genanvendelse    80   60   60  …   70
//   …
//   Hovedtotal                     650  680  760 …   710
//
// The report states no unit, but it is always kg (confirmed by Heartland 2026-11-16), so quantities
// are divided by 1,000 into the groups' tonnes. Each non-empty cell becomes one activity
// line covering its calendar month, so a report that spans two years splits correctly.

import type { ActivityGroup, ActivityLine } from './activity'
import type { CellValue } from './ledger'
import { parseNumber } from './parseNumber'

export class WasteReportError extends Error {}

export type WasteMonth = { year: number; month: number }

export type WasteReportRow = {
  /** As the report writes it, e.g. "Bølgepap" */
  wasteType: string
  /** As the report writes it, e.g. "Genanvendelse" */
  treatment: string
  /** One value per month, in report order; null where the cell is empty */
  values: (number | null)[]
}

export type WasteReport = {
  /** e.g. "aug 2025 - jul 2026" */
  periodLabel: string
  months: WasteMonth[]
  rows: WasteReportRow[]
  /** Months where the report's own total differs from the sum of its rows (1-based) */
  totalMismatches: number[]
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const PERIOD = /^\s*([a-zæøå]{3})\.?\s+(\d{4})\s*[-–]\s*([a-zæøå]{3})\.?\s+(\d{4})\s*$/i

const text = (v: CellValue): string =>
  v == null ? '' : v instanceof Date ? v.toISOString() : String(v).trim()

function monthIndex(name: string): number {
  const i = MONTHS.indexOf(name.toLowerCase().replace('may', 'maj').replace('oct', 'okt'))
  if (i < 0) throw new WasteReportError(`Ukendt måned "${name}" i perioden.`)
  return i
}

function cellNumber(v: CellValue): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return v
  const n = parseNumber(text(v))
  if (n === null) return null
  if (Number.isNaN(n)) throw new WasteReportError(`"${text(v)}" er ikke et tal.`)
  return n
}

/** Reads the report's cells. Throws a WasteReportError saying what's wrong with the file. */
export function parseWasteReport(grid: readonly (readonly CellValue[])[]): WasteReport {
  const periodRow = grid.find((r) => r.some((c) => PERIOD.test(text(c))))
  const periodLabel = periodRow ? text(periodRow.find((c) => PERIOD.test(text(c)))) : ''
  if (!periodLabel) throw new WasteReportError('Filen nævner ingen periode (fx "aug 2025 - jul 2026"). Er det en mængderapport pr. affaldstype?')
  const [, m1, y1, m2, y2] = PERIOD.exec(periodLabel)!
  const first = Number(y1) * 12 + monthIndex(m1)
  const last = Number(y2) * 12 + monthIndex(m2)
  if (last < first) throw new WasteReportError(`Perioden "${periodLabel}" slutter før den begynder.`)

  const headerAt = grid.findIndex((r) => /^affaldstype$/i.test(text(r[0])) && /^behandling/i.test(text(r[1])))
  if (headerAt < 0) throw new WasteReportError('Filen har ingen kolonner "Affaldstype" og "Behandlingsform". Er det en mængderapport pr. affaldstype?')
  const header = grid[headerAt]
  const monthCols: number[] = []
  for (let c = 2; c < header.length; c++) {
    const n = cellNumber(header[c])
    if (n === null) continue
    if (n !== monthCols.length + 1) throw new WasteReportError(`Månedskolonnerne skal være nummereret 1, 2, 3 …; kolonne ${c + 1} hedder "${text(header[c])}".`)
    monthCols.push(c)
  }
  const count = last - first + 1
  if (monthCols.length !== count) {
    throw new WasteReportError(`Perioden "${periodLabel}" er ${count} måneder, men filen har ${monthCols.length} månedskolonner.`)
  }
  const months = Array.from({ length: count }, (_, i) => ({ year: Math.floor((first + i) / 12), month: ((first + i) % 12) + 1 }))

  const rows: WasteReportRow[] = []
  let totals: (number | null)[] | null = null
  for (const r of grid.slice(headerAt + 1)) {
    const wasteType = text(r[0])
    const values = monthCols.map((c) => cellNumber(r[c]))
    if (/^(hoved)?total/i.test(wasteType)) { totals = values; break }
    if (!wasteType) {
      if (values.some((v) => v !== null)) throw new WasteReportError('En række har mængder men ingen affaldstype.')
      continue
    }
    rows.push({ wasteType, treatment: text(r[1]), values })
  }
  if (rows.length === 0) throw new WasteReportError('Filen har ingen affaldstyper.')

  const totalMismatches: number[] = []
  if (totals) {
    totals.forEach((t, i) => {
      const sum = rows.reduce((s, r) => s + (r.values[i] ?? 0), 0)
      if (Math.abs((t ?? 0) - sum) > 1e-6) totalMismatches.push(i + 1)
    })
  }
  return { periodLabel, months, rows, totalMismatches }
}

// Which category 5 group each waste type and treatment goes to. The first rule that matches
// the waste type wins, so the specific ones come first: "Flasker og glasemballage" is glass, and
// "Emball., plast/karton/metal" is mixed packaging, not cardboard. Danish recycling of organic waste is biogas (anaerobic digestion).
const RULES: readonly { type: RegExp; treatment: RegExp; group: string }[] = [
  { type: /glas|flask/i, treatment: /genanv/i, group: 'k5-glas-gen' },
  { type: /emball/i, treatment: /genanv/i, group: 'k5-blandet-gen' },
  { type: /organisk|mad|bio/i, treatment: /genanv|bioforgas|biogas/i, group: 'k5-mad-bio' },
  { type: /pap|papir|karton/i, treatment: /genanv/i, group: 'k5-papir-gen' },
  { type: /pap|papir|karton/i, treatment: /deponi/i, group: 'k5-papir-dep' },
  { type: /træ|palle/i, treatment: /genanv/i, group: 'k5-trae-gen' },
  { type: /træ|palle/i, treatment: /deponi/i, group: 'k5-trae-dep' },
  { type: /plast/i, treatment: /genanv/i, group: 'k5-plast-gen' },
  { type: /plast/i, treatment: /forbr/i, group: 'k5-plast-forbr' },
  { type: /elektron|weee/i, treatment: /genanv/i, group: 'k5-andet-gen' },
  // "Restaffald (Småt brændbart)" was renamed "Småt brændbart affald" in March 2026: the same waste type
  // (confirmed by Heartland 2026-11-16), so both go here.
  { type: /rest|brændbar/i, treatment: /forbr/i, group: 'k5-erhverv-forbr' },
]

/** The group a report row goes to, or null when the user has to choose. */
export function wasteGroupFor(wasteType: string, treatment: string): string | null {
  return RULES.find((r) => r.type.test(wasteType) && r.treatment.test(treatment))?.group ?? null
}

/** Stamped on every imported line, so a later report for the same months and address replaces it. */
export const WASTE_IMPORT_PREFIX = 'Affaldsrapport:'

const pad = (n: number) => String(n).padStart(2, '0')
const monthStart = (m: WasteMonth) => `${m.year}-${pad(m.month)}-01`
const monthEnd = (m: WasteMonth) => `${m.year}-${pad(m.month)}-${pad(new Date(Date.UTC(m.year, m.month, 0)).getUTCDate())}`
export const monthLabel = (m: WasteMonth) => `${MONTHS[m.month - 1]} ${m.year}`

export type WastePlan = {
  /** The lines to add, without ids */
  lines: Omit<ActivityLine, 'id'>[]
  /** Ids of earlier imported lines in the same months at the same address, replaced by these */
  replaces: string[]
  /** Report rows (by index) that have quantities but no group yet */
  unassigned: number[]
}

/**
 * The lines a report becomes: one per row and month with a quantity, from kg to tonnes, covering the
 * calendar month, at the chosen address. `groups` is the chosen group per row (index-aligned);
 * rows without one are left out and listed as unassigned.
 */
export function planWasteLines(
  report: WasteReport,
  groups: readonly (string | null)[],
  locationId: string | null,
  existing: readonly ActivityLine[],
  validGroups: readonly ActivityGroup[],
): WastePlan {
  const known = new Set(validGroups.map((g) => g.id))
  const lines: Omit<ActivityLine, 'id'>[] = []
  const unassigned: number[] = []
  report.rows.forEach((row, i) => {
    const group = groups[i]
    const hasQuantity = row.values.some((v) => v !== null && v !== 0)
    if (!group || !known.has(group)) {
      if (hasQuantity) unassigned.push(i)
      return
    }
    row.values.forEach((v, m) => {
      if (v === null || v === 0) return
      const month = report.months[m]
      lines.push({
        group,
        date: monthStart(month),
        dateTo: monthEnd(month),
        quantity: v / 1000,
        description: `${WASTE_IMPORT_PREFIX} ${row.wasteType} (${row.treatment}), ${monthLabel(month)}`,
        ...(locationId ? { locationId } : {}),
      })
    })
  })

  const from = monthStart(report.months[0])
  const to = monthEnd(report.months[report.months.length - 1])
  const replaces = existing
    .filter((l) => l.description?.startsWith(WASTE_IMPORT_PREFIX) && l.date >= from && l.date <= to && (l.locationId ?? null) === locationId)
    .map((l) => l.id)
  return { lines, replaces, unassigned }
}
