import { describe, expect, it } from 'vitest'
import { GroupExportError, measureOf, ownershipScale, parseGroupExport, parsePeriodLabel, periodEndDate, planInvestments, turnoverToRevenue } from './groupExport'
import { parseCsvGrid, type CellValue } from './ledger'

// The layout the consolidation system exports. The company names and amounts are invented: the
// group's own entity names and figures are not committed. "01.01.20 Ltd." is there because a
// company name can look like a date, and must not be read as a period column.
const ownershipCsv = [
  ';;',
  'InternalExternal;Intern;',
  'Measures;Value DKK;',
  'Time Calculations;YTD;',
  'Analysis;Actual;',
  'Account Internal;Ownership Percentage (CL);',
  ';;',
  ';Year-Month;',
  'FriendlyName;July 2025;July 2026',
  'Alfa Holding;1,00;1,00',
  'Alfa Holding Ltd.;1,00;1,00',
  'Beta Gruppen;;',
  '01.01.20 Ltd.;1,00;1,00',
  'Delejet ApS;0,40;0,45',
].join('\n')

const turnoverCsv = [
  'InternalExternal;Intern;',
  'Measures;Value DKK;',
  'Time Calculations;YTD;',
  'Analysis;Actual;',
  'Account Internal;Net Turnover;',
  ';;',
  ';Year-Month;',
  'FriendlyName;July 2025;July 2026',
  'Alfa Holding;-12.000.000,00;-13.500.000,00',
  'Delejet ApS;-4.000.000,50;-4.500.000,25',
].join('\n')

const read = (csv: string) => parseGroupExport(parseCsvGrid(csv) as CellValue[][])

describe('parsePeriodLabel', () => {
  it('reads the period column headings the system writes', () => {
    expect(parsePeriodLabel('July 2025')).toEqual({ label: 'July 2025', year: 2025, month: 7 })
    expect(parsePeriodLabel('juli 2026')).toEqual({ label: 'juli 2026', year: 2026, month: 7 })
    expect(parsePeriodLabel('dec. 2025')).toMatchObject({ year: 2025, month: 12 })
    expect(parsePeriodLabel('2025-07')).toMatchObject({ year: 2025, month: 7 })
    expect(parsePeriodLabel('07.2025')).toMatchObject({ year: 2025, month: 7 })
    expect(parsePeriodLabel(new Date(Date.UTC(2025, 6, 31)))).toMatchObject({ year: 2025, month: 7 })
  })

  it('is not fooled by the other text in the file', () => {
    for (const v of ['Year-Month', 'FriendlyName', 'Value DKK', 'YTD', '1,00', '', null, 'Month 2025', '2025-13']) {
      expect(parsePeriodLabel(v as CellValue)).toBeNull()
    }
  })
})

describe('measureOf', () => {
  it('recognises the measures the app can use', () => {
    expect(measureOf('Ownership Percentage (CL)')).toBe('ownership')
    expect(measureOf('Net Turnover')).toBe('turnover')
    expect(measureOf('Investment Amount')).toBe('investment')
    expect(measureOf('EBITDA')).toBe('unknown')
  })
})

describe('parseGroupExport', () => {
  it('reads the measure, the periods and one value per company', () => {
    const e = read(ownershipCsv)
    expect(e.measure).toBe('ownership')
    expect(e.measureText).toBe('Ownership Percentage (CL)')
    expect(e.dimension).toBe('FriendlyName')
    expect(e.periods).toEqual([
      { label: 'July 2025', year: 2025, month: 7 },
      { label: 'July 2026', year: 2026, month: 7 },
    ])
    expect(e.rows).toEqual([
      { name: 'Alfa Holding', values: [1, 1] },
      { name: 'Alfa Holding Ltd.', values: [1, 1] },
      { name: '01.01.20 Ltd.', values: [1, 1] },
      { name: 'Delejet ApS', values: [0.4, 0.45] },
    ])
  })

  it('skips the rows that carry no value, and counts them', () => {
    expect(read(ownershipCsv).skipped).toBe(1) // Beta Gruppen
  })

  it('keeps what was chosen in the source system, so the user can check it', () => {
    expect(read(ownershipCsv).settings).toEqual([
      { label: 'InternalExternal', value: 'Intern' },
      { label: 'Measures', value: 'Value DKK' },
      { label: 'Time Calculations', value: 'YTD' },
      { label: 'Analysis', value: 'Actual' },
      { label: 'Account Internal', value: 'Ownership Percentage (CL)' },
    ])
  })

  it('reads amounts in the Danish format, keeping the credit sign', () => {
    expect(read(turnoverCsv).rows).toEqual([
      { name: 'Alfa Holding', values: [-12_000_000, -13_500_000] },
      { name: 'Delejet ApS', values: [-4_000_000.5, -4_500_000.25] },
    ])
  })

  it('reads the Investment Amount sheet, whose rows are another dimension', () => {
    const e = read([
      'Account Internal;Investment Amount;',
      ';Year-Month;',
      'Organization Held Original;July 2025;July 2026',
      'Selskabet af 1.1.2000;1.000.000,00;1.000.000,00',
    ].join('\n'))
    expect(e.measure).toBe('investment')
    expect(e.dimension).toBe('Organization Held Original')
    expect(e.rows).toEqual([{ name: 'Selskabet af 1.1.2000', values: [1_000_000, 1_000_000] }])
  })

  it('says what is wrong instead of importing nonsense', () => {
    expect(() => read('Konto;Beløb\n6100;100')).toThrow(GroupExportError)
    expect(() => read('Konto;Beløb\n6100;100')).toThrow(/periodekolonner/)
    expect(() => read(';Year-Month;\nFriendlyName;July 2025\nAlfa Holding;1,00')).toThrow(/Account Internal/)
    expect(() => read('Account Internal;Net Turnover;\n;Year-Month;\nFriendlyName;July 2025\nBeta Gruppen;')).toThrow(/ingen selskaber/)
  })
})

describe('ownershipScale', () => {
  it('reads a share as a percentage, and a percentage as itself', () => {
    expect(ownershipScale([1, 0.4, null])).toEqual({ factor: 100, asShare: true })
    expect(ownershipScale([100, 40])).toEqual({ factor: 1, asShare: false })
  })
})

describe('turnoverToRevenue', () => {
  it('turns the credit into revenue', () => {
    expect(turnoverToRevenue(-12_000_000)).toBe(12_000_000)
  })
})

describe('planInvestments', () => {
  const plan = (periodLabel: string, existing: { id: string; company: string; date: string }[] = []) =>
    planInvestments([read(ownershipCsv), read(turnoverCsv)], periodLabel, existing)

  it('keeps only holdings of 50 % or less as category 15, and says why for the rest', () => {
    expect(plan('July 2025').map((r) => [r.name, r.ownershipPct, r.status])).toEqual([
      ['Alfa Holding', 100, 'consolidated'],
      ['Alfa Holding Ltd.', 100, 'consolidated'],
      ['01.01.20 Ltd.', 100, 'consolidated'],
      ['Delejet ApS', 40, 'new'],
    ])
  })

  it('joins the ownership and turnover exports by company, turning the credit into revenue', () => {
    expect(plan('July 2025').find((r) => r.name === 'Delejet ApS')).toMatchObject({ ownershipPct: 40, revenueDKK: 4_000_000.5 })
    expect(plan('July 2026').find((r) => r.name === 'Delejet ApS')).toMatchObject({ ownershipPct: 45, revenueDKK: 4_500_000.25 })
  })

  it('updates a company that is already in category 15, matching the name loosely', () => {
    expect(plan('July 2025', [{ id: 'inv-1', company: ' delejet aps ', date: '2025-12-31' }]).find((r) => r.name === 'Delejet ApS'))
      .toMatchObject({ status: 'update', existingId: 'inv-1' })
  })

  it('adds a new row for another year, so each year keeps its own figures', () => {
    const existing = [{ id: 'inv-1', company: 'Delejet ApS', date: '2025-12-31' }]
    expect(plan('July 2026', existing).find((r) => r.name === 'Delejet ApS')).toMatchObject({ status: 'new', existingId: null })
  })

  it('has no values for a period the export does not cover', () => {
    expect(plan('July 2027').every((r) => r.ownershipPct === null && r.revenueDKK === null)).toBe(true)
  })

  it('reads an export written in percent as percent', () => {
    const pct = read(['Account Internal;Ownership Percentage;', ';Year-Month;', 'FriendlyName;July 2025', 'Delejet ApS;40,00'].join('\n'))
    expect(planInvestments([pct], 'July 2025', [])[0]).toMatchObject({ ownershipPct: 40, status: 'new' })
  })
})

describe('periodEndDate', () => {
  it('dates a holding on the last day of its period', () => {
    expect(periodEndDate({ label: 'July 2025', year: 2025, month: 7 })).toBe('2025-07-31')
    expect(periodEndDate({ label: 'February 2024', year: 2024, month: 2 })).toBe('2024-02-29')
  })
})
