import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import { category5, category5Groups } from './scope3'
import { parseWasteReport, planWasteLines, wasteGroupFor, WasteReportError, WASTE_IMPORT_PREFIX } from './wasteReport'
import type { CellValue } from './ledger'
import { readXlsxSheet } from './readXlsx'
import { makeXlsx } from './testing/xlsx'

const n = (...xs: (number | null)[]) => xs

/** The layout of Marius Pedersen's quantity report, with its real figures for aug 2025 – jul 2026. */
function report(overrides: { period?: string; header?: CellValue[]; total?: (number | null)[] } = {}): CellValue[][] {
  return [
    [],
    ['Periode:'],
    [overrides.period ?? 'aug 2025 - jul 2026'],
    [],
    ['Mængderapport - pr. affaldstype'],
    [null, null, 'Periode', 'Aktivitets mdr.'],
    [null, null, 'aug 2025 - jul 2026'],
    overrides.header ?? ['Affaldstype', 'Behandlingsform', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    ['Bølgepap', 'Genanvendelse', ...n(80, 60, 60, 60, 70, 80, 80, 80, 80, 80, 70, 70)],
    ['Emball., plast/karton/metal', 'Genanvendelse', ...n(90, 110, 90, 90, 90, 90, 70, 120, 100, 100, 90, 110)],
    ['Flasker og glasemballage', 'Genanvendelse', ...n(null, null, null, null, null, null, null, null, 50, null, null, null)],
    ['Organisk affald', 'Genanvendelse', ...n(170, 220, 360, 130, 210, 220, 160, 320, 190, 230, 220, 220)],
    ['Restaffald (Småt brændbart)', 'Forbrænding', ...n(310, 290, 250, 250, 250, 320, 160)],
    ['Småt brændbart affald', 'Forbrænding', ...n(null, null, null, null, null, null, null, 200, 300, 280, 310, 310)],
    ['Hovedtotal', null, ...(overrides.total ?? n(650, 680, 760, 530, 620, 710, 470, 720, 720, 690, 690, 710))],
  ]
}

describe('parseWasteReport', () => {
  it('reads the period, the months and every waste type', () => {
    const r = parseWasteReport(report())
    expect(r.periodLabel).toBe('aug 2025 - jul 2026')
    expect(r.months[0]).toEqual({ year: 2025, month: 8 })
    expect(r.months[4]).toEqual({ year: 2025, month: 12 })
    expect(r.months[5]).toEqual({ year: 2026, month: 1 })
    expect(r.months[11]).toEqual({ year: 2026, month: 7 })
    expect(r.rows.map((x) => x.wasteType)).toEqual([
      'Bølgepap', 'Emball., plast/karton/metal', 'Flasker og glasemballage', 'Organisk affald',
      'Restaffald (Småt brændbart)', 'Småt brændbart affald',
    ])
    expect(r.rows[2].values[8]).toBe(50)
    expect(r.rows[4].values[7]).toBeNull()
    expect(r.totalMismatches).toEqual([])
  })

  it('reads the report from an Excel file', async () => {
    const cells = report().map((row) => row.map((c) => (c === undefined ? null : (c as string | number | null))))
    const r = parseWasteReport(await readXlsxSheet(makeXlsx(cells).buffer as ArrayBuffer))
    expect(r.rows).toHaveLength(6)
    expect(r.rows[3]).toMatchObject({ wasteType: 'Organisk affald', treatment: 'Genanvendelse' })
    expect(r.totalMismatches).toEqual([])
  })

  it('flags months where the report total is not the sum of its rows', () => {
    const r = parseWasteReport(report({ total: n(650, 681, 760, 530, 620, 710, 470, 720, 720, 690, 690, 710) }))
    expect(r.totalMismatches).toEqual([2])
  })

  it('reads numbers written as Danish text', () => {
    const grid = report()
    grid[8][2] = '1.234,5'
    expect(parseWasteReport(grid).rows[0].values[0]).toBe(1234.5)
  })

  it('rejects a file that is not a quantity report', () => {
    expect(() => parseWasteReport([['Konto', 'Beløb'], ['1000', 5]])).toThrow(WasteReportError)
    expect(() => parseWasteReport(report({ header: ['Type', 'Behandling', 1, 2] }))).toThrow(/Affaldstype/)
  })

  it('rejects a period that does not match the month columns', () => {
    expect(() => parseWasteReport(report({ period: 'aug 2025 - jun 2026' }))).toThrow(/11 måneder.*12 månedskolonner/)
  })

  it('rejects month columns out of order', () => {
    expect(() => parseWasteReport(report({ header: ['Affaldstype', 'Behandlingsform', 1, 3, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12] }))).toThrow(/nummereret/)
  })

  it('rejects a quantity that is not a number', () => {
    const grid = report()
    grid[8][3] = 'ca. 60'
    expect(() => parseWasteReport(grid)).toThrow(/ikke et tal/)
  })
})

describe('wasteGroupFor', () => {
  it('maps the Marius Pedersen waste types', () => {
    expect(wasteGroupFor('Bølgepap', 'Genanvendelse')).toBe('k5-papir-gen')
    expect(wasteGroupFor('Emball., plast/karton/metal', 'Genanvendelse')).toBe('k5-blandet-gen')
    expect(wasteGroupFor('Flasker og glasemballage', 'Genanvendelse')).toBe('k5-glas-gen')
    expect(wasteGroupFor('Organisk affald', 'Genanvendelse')).toBe('k5-mad-bio')
    expect(wasteGroupFor('Restaffald (Småt brændbart)', 'Forbrænding')).toBe('k5-erhverv-forbr')
    expect(wasteGroupFor('Småt brændbart affald', 'Forbrænding')).toBe('k5-erhverv-forbr')
  })

  it('leaves an unknown combination for the user', () => {
    expect(wasteGroupFor('Farligt affald', 'Specialbehandling')).toBeNull()
    expect(wasteGroupFor('Organisk affald', 'Deponi')).toBeNull()
  })

  it('only points at groups that exist', () => {
    const ids = new Set(category5Groups.map((g) => g.id))
    for (const [t, b] of [['Bølgepap', 'Genanvendelse'], ['Pap', 'Deponi'], ['Træ', 'Genanvendelse'], ['Paller', 'Deponi'], ['Plast', 'Genanvendelse'], ['Plast', 'Forbrænding'], ['Elektronik', 'Genanvendelse']]) {
      expect(ids.has(wasteGroupFor(t, b)!), `${t}/${b}`).toBe(true)
    }
  })
})

describe('planWasteLines', () => {
  const parsed = parseWasteReport(report())
  const groups = parsed.rows.map((r) => wasteGroupFor(r.wasteType, r.treatment))

  it('makes one line per row and month with a quantity, in tonnes, covering the month', () => {
    const p = planWasteLines(parsed, groups, 'kg', [], category5Groups)
    expect(p.lines).toHaveLength(12 + 12 + 1 + 12 + 7 + 5)
    expect(p.unassigned).toEqual([])
    const first = p.lines[0]
    expect(first).toMatchObject({ group: 'k5-papir-gen', date: '2025-08-01', dateTo: '2025-08-31', quantity: 0.08 })
    expect(first.description).toBe(`${WASTE_IMPORT_PREFIX} Bølgepap (Genanvendelse), aug 2025`)
    const feb = p.lines.find((l) => l.date === '2026-02-01')!
    expect(feb.dateTo).toBe('2026-02-28')
    const total = p.lines.reduce((s, l) => s + (l.quantity ?? 0), 0)
    expect(total).toBeCloseTo(7.95, 9)
  })

  it('takes the quantities as tonnes when told to', () => {
    expect(planWasteLines(parsed, groups, 'tonne', [], category5Groups).lines[0].quantity).toBe(80)
  })

  it('leaves out rows without a group and lists them', () => {
    const p = planWasteLines(parsed, [null, ...groups.slice(1)], 'kg', [], category5Groups)
    expect(p.unassigned).toEqual([0])
    expect(p.lines.some((l) => l.description?.includes('Bølgepap'))).toBe(false)
  })

  it('replaces earlier imported lines in the same months, and nothing else', () => {
    const existing = [
      { id: 'old-import', group: 'k5-papir-gen', date: '2025-09-01', dateTo: '2025-09-30', quantity: 1, description: `${WASTE_IMPORT_PREFIX} Bølgepap (Genanvendelse), sep 2025` },
      { id: 'older-import', group: 'k5-papir-gen', date: '2025-07-01', dateTo: '2025-07-31', quantity: 1, description: `${WASTE_IMPORT_PREFIX} Bølgepap (Genanvendelse), jul 2025` },
      { id: 'manual', group: 'k5-papir-gen', date: '2025-09-15', quantity: 1, description: 'Ekstra container' },
    ]
    expect(planWasteLines(parsed, groups, 'kg', existing, category5Groups).replaces).toEqual(['old-import'])
  })

  it('splits the report between the two calendar years', () => {
    const lines = planWasteLines(parsed, groups, 'kg', [], category5Groups).lines.map((l, i) => ({ ...l, id: String(i) }))
    const y2025 = category5(lines, factors, { start: '2025-01-01', end: '2025-12-31' })
    const y2026 = category5(lines, factors, { start: '2026-01-01', end: '2026-12-31' })
    const tonnes = (s: typeof y2025) => s.lines.reduce((a, r) => a + (r.line.quantity ?? 0) * r.share, 0)
    expect(tonnes(y2025)).toBeCloseTo(3.24, 9) // aug–dec 2025
    expect(tonnes(y2026)).toBeCloseTo(4.71, 9) // jan–jul 2026
    expect(y2025.total + y2026.total).toBeGreaterThan(0)
  })
})
