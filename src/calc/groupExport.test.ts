import { describe, expect, it } from 'vitest'
import {
  GroupExportError, importedAccountingMethod, importedBasis, importedBatches, measureOf, ownershipScale, parseCompanyTable, parseGroupExport,
  parseGroupExports, parsePeriodLabel, periodEndDate, planInvestments, revenueSign, turnoverToRevenue,
} from './groupExport'
import { parseCsvGrid, type CellValue } from './ledger'
import { readXlsxSheets } from './readXlsx'
import { makeWorkbook } from './testing/xlsx'

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
    expect(measureOf('Revenue juli 2026 (DKK)')).toBe('turnover')
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

  it('reads an export that starts further in, as the Excel add-in saves it (at C3)', () => {
    const atC3 = parseCsvGrid(ownershipCsv).map((row) => ['', '', ...row]) as CellValue[][]
    expect(parseGroupExport([[], [], ...atC3])).toEqual(read(ownershipCsv))
  })

  it('passes over the rows the cube adds that are not entities', () => {
    const e = read([
      'Account Internal;Ownership Percentage (CL);',
      ';Year-Month;',
      'FriendlyName;July 2025',
      'Not Available;45,45',
      'Group Not Available;45,45',
      '(Transactions on Alfa Holding);0,10',
      'Delejet ApS;0,40',
    ].join('\n'))
    expect(e.rows.map((r) => r.name)).toEqual(['Delejet ApS'])
    expect(e.skipped).toBe(3)
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

  it('goes by most values, so one odd row cannot turn 100 % into 1 %', () => {
    expect(ownershipScale([1, 0.4, 1, 45.45])).toEqual({ factor: 100, asShare: true })
    expect(ownershipScale([100, 40, 0.5])).toEqual({ factor: 1, asShare: false })
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
    expect(plan('July 2025', [{ id: 'inv-1', company: ' delejet aps ', date: '2025-07-31' }]).find((r) => r.name === 'Delejet ApS'))
      .toMatchObject({ status: 'update', existingId: 'inv-1' })
  })

  it('adds a new row for a holding on another date, even in the same year', () => {
    expect(plan('July 2025', [{ id: 'inv-1', company: 'Delejet ApS', date: '2025-12-31' }]).find((r) => r.name === 'Delejet ApS'))
      .toMatchObject({ status: 'new', existingId: null })
  })

  it('adds a new row for another year, so each year keeps its own figures', () => {
    const existing = [{ id: 'inv-1', company: 'Delejet ApS', date: '2025-12-31' }]
    expect(plan('July 2026', existing).find((r) => r.name === 'Delejet ApS')).toMatchObject({ status: 'new', existingId: null })
  })

  it('has no values for a period the export does not cover', () => {
    expect(plan('July 2027').every((r) => r.ownershipPct === null && r.revenueDKK === null)).toBe(true)
  })

  it('treats a zero, negative or residual share as no holding', () => {
    const sold = read(['Account Internal;Ownership Percentage (CL);', ';Year-Month;', 'FriendlyName;July 2025',
      'Solgt A/S;-0,000002', 'Rest ApS;0,0000001', 'Lille AB;0,000003', 'Delejet ApS;0,40'].join('\n'))
    expect(planInvestments([sold], 'July 2025', []).map((r) => [r.name, r.status])).toEqual([
      ['Solgt A/S', 'unknownShare'],
      ['Rest ApS', 'unknownShare'],
      ['Lille AB', 'new'],
      ['Delejet ApS', 'new'],
    ])
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

describe('a workbook with one sheet per measure', () => {
  it('reads every sheet, so each can be parsed as its own export', async () => {
    const grid = (csv: string) => parseCsvGrid(csv).map((row) => row.map((v) => (v === '' ? null : v)))
    const book = makeWorkbook([
      { name: 'Ejerandel', rows: grid(ownershipCsv) },
      { name: 'Revenue', rows: grid(turnoverCsv) },
      { name: 'XLCubedFormats', rows: [['Basic Grid Format']] },
    ])
    const sheets = await readXlsxSheets(book.buffer as ArrayBuffer)
    expect(sheets.map((s) => s.name)).toEqual(['Ejerandel', 'Revenue', 'XLCubedFormats'])
    expect(parseGroupExport(sheets[0].grid).measure).toBe('ownership')
    expect(parseGroupExport(sheets[1].grid).measure).toBe('turnover')
    expect(() => parseGroupExport(sheets[2].grid)).toThrow(GroupExportError)
  })
})

describe('importedBasis', () => {
  it("uses the data manual's investment amount when the export has a positive one, else revenue", () => {
    expect(importedBasis({ investmentDKK: 30_756_800 })).toBe('Investment')
    expect(importedBasis({ investmentDKK: null })).toBe('Revenue')
    expect(importedBasis({ investmentDKK: 0 })).toBe('Revenue')
    expect(importedBasis({ investmentDKK: -6_766_896 })).toBe('Revenue')
  })
})

describe('importedBatches', () => {
  it('lists each import by its period, with the holdings it created or updated', () => {
    const batches = importedBatches([
      { id: 'a', dataSource: 'Koncernsystem, July 2025' },
      { id: 'b', dataSource: 'Årsrapport' },
      { id: 'c', dataSource: 'Koncernsystem, July 2026' },
      { id: 'd', dataSource: 'Koncernsystem, July 2025' },
      { id: 'e', dataSource: '' },
    ])
    expect(batches).toEqual([
      { source: 'Koncernsystem, July 2025', periodLabel: 'July 2025', ids: ['a', 'd'] },
      { source: 'Koncernsystem, July 2026', periodLabel: 'July 2026', ids: ['c'] },
    ])
  })

  it('has none when nothing was imported', () => {
    expect(importedBatches([{ id: 'b', dataSource: 'Årsrapport' }])).toEqual([])
  })
})

// The cube's company table (ADR 0025), with invented companies and figures. An empty lookup is
// '' as Excel caches it, and "Not Available" is a FriendlyName several companies share.
const companyTable: CellValue[][] = [
  ['Heartland – revenue, ejerandel og investment amount pr. selskab, juli 2026 (YTD 2025/26)'],
  ['OrganizationID', 'Selskabsnavn (OrganizationName)', 'FriendlyID', 'FriendlyName', 'Division', 'BusinessArea', 'OwnershipType', 'Revenue juli 2026 (DKK)', 'Ejerandel juli 2026', 'Investment Amount juli 2026 (DKK)'],
  ['101', 'Alfa Holding A/S', '101', 'Alfa Holding', 'NA', 'N/A', 'Subsidiary', 13_500_000, 1, 250_000_000],
  ['401_464', 'Delejet SE', '401', 'Delejet', 'Retail', 'Apparel', 'Associated', 120_000_000_000.5, 0.25, 4_000_000_000],
  ['157', 'Gamma Fashion Ltd', '157', 'Not Available', 'NA', 'Not Available', 'NA', '', 0.15, ''],
  ['208_103', 'Epsilon Ltd', '208', 'Not Available', 'NA', 'Not Available', 'NA', '', 0.1, 300_000],
  ['629', 'Zeta Farms ApS', '629', 'Zeta', 'Land', 'Farming & Forestry', 'Cost', 0, 0.05, 12_000_000],
  [null, null, null, null, null, null, null, null, null, null],
]

describe('parseCompanyTable', () => {
  const [turnover, ownership, investment] = parseCompanyTable(companyTable)!

  it('makes an export per measure, for the month its heading names', () => {
    expect([turnover, ownership, investment].map((e) => e.measure)).toEqual(['turnover', 'ownership', 'investment'])
    expect(ownership.measureText).toBe('Ejerandel juli 2026')
    expect(ownership.periods).toEqual([{ label: 'juli 2026', year: 2026, month: 7 }])
    expect(ownership.dimension).toBe('OrganizationID')
    expect(ownership.settings).toContainEqual({ label: 'Time Calculations', value: 'YTD' })
  })

  it('keys each company by OrganizationID, with how the cube classes it', () => {
    expect(ownership.rows[1]).toEqual({ name: 'Delejet SE', friendlyName: 'Delejet', id: '401_464', ownershipType: 'Associated', businessArea: 'Apparel', values: [0.25] })
    expect(ownership.rows[0]).toMatchObject({ ownershipType: 'Subsidiary', businessArea: '' })
  })

  it('names a company by its legal name (OrganizationName), keeping the FriendlyName it had before (ADR 0040)', () => {
    expect(ownership.rows.map((r) => r.name)).toEqual(['Alfa Holding A/S', 'Delejet SE', 'Gamma Fashion Ltd', 'Epsilon Ltd', 'Zeta Farms ApS'])
    expect(ownership.rows.map((r) => r.friendlyName)).toEqual(['Alfa Holding', 'Delejet', undefined, undefined, 'Zeta'])
    expect(ownership.rows[2]).toMatchObject({ id: '157', ownershipType: '', businessArea: '' })
  })

  it('leaves out empty and zero cells, and counts them', () => {
    expect(turnover.rows.map((r) => r.name)).toEqual(['Alfa Holding A/S', 'Delejet SE'])
    expect(turnover.skipped).toBe(3)
  })

  it('is not one without an OrganizationID column, so the cube layout is read instead', () => {
    const grid = parseCsvGrid(ownershipCsv) as CellValue[][]
    expect(parseCompanyTable(grid)).toBeNull()
    expect(parseGroupExports(grid)).toEqual([read(ownershipCsv)])
  })

  it('says what is wrong when no column holds a measure for a month', () => {
    expect(() => parseCompanyTable([['OrganizationID', 'FriendlyName', 'Revenue (DKK)'], ['1', 'Alfa', 5]])).toThrow(GroupExportError)
  })

  it('reads the table from a workbook', async () => {
    const book = makeWorkbook([{ name: 'Samlet', rows: companyTable.map((row) => row.map((v) => (v === '' ? null : v as string | number | null))) }])
    const [sheet] = await readXlsxSheets(book.buffer as ArrayBuffer)
    expect(parseGroupExports(sheet.grid)).toEqual([turnover, ownership, investment])
  })
})

describe('revenueSign', () => {
  it('turns the cube’s credit into revenue, and leaves a table that has done so alone', () => {
    expect(revenueSign([-12_000_000, -4_000_000, 300])).toBe(-1)
    expect(revenueSign([12_000_000, 4_000_000, -300])).toBe(1)
    expect(revenueSign([null])).toBe(-1)
  })
})

describe('planInvestments from a company table (ADR 0025)', () => {
  const exports = parseCompanyTable(companyTable)!
  const plan = (existing: Parameters<typeof planInvestments>[2] = []) => planInvestments(exports, 'juli 2026', existing)
  const row = (rows: ReturnType<typeof plan>, name: string) => rows.find((r) => r.name === name)!

  it('joins the measures by OrganizationID, with revenue as the table gives it', () => {
    expect(row(plan(), 'Delejet SE')).toEqual({
      name: 'Delejet SE', organizationId: '401_464', ownershipType: 'Associated', businessArea: 'Apparel',
      ownershipPct: 25, revenueDKK: 120_000_000_000.5, investmentDKK: 4_000_000_000, existingId: null,
      complete: false, renamedFrom: null, previousId: null, status: 'new',
    })
    expect(row(plan(), 'Alfa Holding A/S').status).toBe('consolidated')
    expect(row(plan(), 'Zeta Farms ApS')).toMatchObject({ ownershipPct: 5, revenueDKK: null, investmentDKK: 12_000_000, status: 'new' })
  })

  it('keeps companies that share a FriendlyName apart', () => {
    expect(plan().filter((r) => r.status === 'new').map((r) => r.organizationId)).toEqual(['401_464', '157', '208_103', '629'])
  })

  it('updates the holding with the same OrganizationID on the same date, even if it was renamed', () => {
    expect(row(plan([{ id: 'inv-9', company: 'Delejet (gammelt navn)', date: '2026-07-31', organizationId: '401_464' }]), 'Delejet SE'))
      .toMatchObject({ existingId: 'inv-9', status: 'update', renamedFrom: 'Delejet (gammelt navn)', complete: false })
    expect(row(plan([{ id: 'inv-8', company: 'Delejet SE', date: '2026-07-31', organizationId: '999' }]), 'Delejet SE').existingId).toBeNull()
  })

  it('matches a holding saved before OrganizationIDs on its legal name or its FriendlyName', () => {
    expect(row(plan([{ id: 'inv-7', company: 'delejet se', date: '2026-07-31' }]), 'Delejet SE').existingId).toBe('inv-7')
    expect(row(plan([{ id: 'inv-6', company: 'Delejet', date: '2026-07-31' }]), 'Delejet SE')).toMatchObject({ existingId: 'inv-6', renamedFrom: 'Delejet' })
  })

  it('says when the holding it updates is marked complete, so only its name changes', () => {
    expect(row(plan([{ id: 'inv-5', company: 'Delejet', date: '2026-07-31', organizationId: '401_464', complete: true }]), 'Delejet SE'))
      .toMatchObject({ existingId: 'inv-5', complete: true, renamedFrom: 'Delejet' })
  })

  it("points a new holding at the same company's latest holding before it, for last year's factor", () => {
    const existing = [
      { id: 'y24', company: 'Delejet', date: '2024-07-31', organizationId: '401_464' },
      { id: 'y25', company: 'Delejet', date: '2025-07-31', organizationId: '401_464' },
      { id: 'other', company: 'Delejet SE', date: '2025-07-31', organizationId: '999' },
    ]
    expect(row(plan(existing), 'Delejet SE')).toMatchObject({ existingId: null, previousId: 'y25', status: 'new' })
    expect(row(plan(existing), 'Zeta Farms ApS').previousId).toBeNull()
  })
})

describe('importedAccountingMethod', () => {
  it('makes the cube’s associates associates, and everything else another investment', () => {
    expect(importedAccountingMethod({ ownershipType: 'Associated' })).toBe('Ass.')
    for (const ownershipType of ['Other', 'Cost', 'Convertible', 'Subsidiary', '']) {
      expect(importedAccountingMethod({ ownershipType })).toBe('Other investments')
    }
  })
})
