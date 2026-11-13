import { readSheet } from 'read-excel-file/universal'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { excelSerialToDate, guessMapping, parseLedgerDate, rowsToPostings, tableToRows, type CellValue } from './ledger'
import { readXlsxSheet } from './readXlsx'
import { makeXlsx } from './testing/xlsx'

// The Power Apps host blocks Web Workers (worker-src 'none'). fflate's asynchronous unzip,
// which read-excel-file uses, inflates a compressed entry of 512 KB or more in a worker (unless
// it's barely compressed). Make that case fail here, as it does in the host. read-excel-file is
// inlined in the test config so this mock reaches it.
vi.mock('fflate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fflate')>()
  const unzip = ((data: Uint8Array, opts: unknown, cb?: unknown) => {
    actual.unzipSync(data, {
      filter: (f) => {
        if (f.compression === 8 && f.originalSize >= 524_288 && f.size <= 0.8 * f.originalSize) {
          throw new Error(`worker-src none: ${f.name} would be inflated in a worker`)
        }
        return false
      },
    })
    return (actual.unzip as (...a: unknown[]) => unknown)(data, opts, cb)
  }) as typeof actual.unzip
  return { ...actual, unzip }
})

describe('excelSerialToDate', () => {
  it('reads Excel date serials in the 1900 date system', () => {
    expect(excelSerialToDate(45747)).toBe('2025-03-31')
    expect(excelSerialToDate(45658)).toBe('2025-01-01')
    expect(excelSerialToDate(45747.75)).toBe('2025-03-31')
  })

  it('rejects numbers that cannot be dates', () => {
    expect(excelSerialToDate(0)).toBe('')
    expect(excelSerialToDate(-5)).toBe('')
    expect(excelSerialToDate(Number.NaN)).toBe('')
    expect(excelSerialToDate(3_000_000)).toBe('')
  })

  it('handles date cells and serials in parseLedgerDate', () => {
    expect(parseLedgerDate(new Date(Date.UTC(2025, 2, 31)))).toBe('2025-03-31')
    expect(parseLedgerDate(45747)).toBe('2025-03-31')
    expect(parseLedgerDate(new Date('nope'))).toBe('')
    expect(parseLedgerDate(true)).toBe('')
  })
})

describe('tableToRows', () => {
  it('names blank headers and numbers repeated ones', () => {
    const { headers } = tableToRows([['Dato', '', 'Beløb', 'Beløb']])
    expect(headers).toEqual(['Dato', 'Kolonne 2', 'Beløb', 'Beløb (2)'])
  })

  it('skips blank rows and keeps cell types', () => {
    const date = new Date(Date.UTC(2025, 2, 31))
    const { rows } = tableToRows([['Dato', 'Beløb'], [null, ''], [date, 7460.4]] as CellValue[][])
    expect(rows).toEqual([{ Dato: date, Beløb: 7460.4 }])
  })

  it('writes numeric account numbers as text', () => {
    const { rows } = tableToRows([['Konto', 'Beløb'], [6100, 12]])
    expect(rowsToPostings(rows, { ...guessMapping(['Konto', 'Beløb']) })[0].account).toBe('6100')
  })
})

describe('reading a real .xlsx file', () => {
  const file = makeXlsx([
    ['Bilagsdato', 'Kontonr.', 'Kontotekst', 'Kreditor', 'Posteringstekst', 'Beløb', 'Valuta'],
    [{ date: 45747 }, 6100, 'Revision', 'Deloitte', 'Årsrevision — ø & æ', 185000, 'DKK'],
    // A date without its date format arrives as a plain number (the serial).
    [45672, 6200, 'Software', 'Microsoft Ireland', 'Licens', 12400.5, 'EUR'],
    [null, null, null, null, null, null, null],
    [{ date: 45870 }, 7300, 'Bankgebyrer', 'Danske Bank', 'Gebyrer', -3150, null],
  ])

  it('becomes the same postings a CSV would', async () => {
    const { headers, rows } = tableToRows(await readXlsxSheet(new Blob([file as BlobPart])))
    const postings = rowsToPostings(rows, guessMapping(headers))
    expect(postings).toEqual([
      { date: '2025-03-31', account: '6100', accountName: 'Revision', supplier: 'Deloitte', text: 'Årsrevision — ø & æ', amount: 185000, currency: 'DKK' },
      { date: '2025-01-15', account: '6200', accountName: 'Software', supplier: 'Microsoft Ireland', text: 'Licens', amount: 12400.5, currency: 'EUR' },
      { date: '2025-08-01', account: '7300', accountName: 'Bankgebyrer', supplier: 'Danske Bank', text: 'Gebyrer', amount: -3150, currency: 'DKK' },
    ])
  })
})

describe('reading a large .xlsx file without Web Workers', () => {
  // About 2 MB of sheet XML: well over the 512 KB fflate inflates in a worker
  const rows = Array.from({ length: 12_000 }, (_, i) => [{ date: 45658 + (i % 300) }, 6100 + (i % 50), 'Konto', `Kreditor ${i}`, `Postering nummer ${i} med en lang tekst`, i * 1.25, 'DKK'] as const)
  const file = makeXlsx([['Bilagsdato', 'Kontonr.', 'Kontotekst', 'Kreditor', 'Posteringstekst', 'Beløb', 'Valuta'], ...rows.map((r) => [...r])])

  afterEach(() => { vi.unstubAllGlobals() })

  it('would need a worker when read the library\'s way', async () => {
    await expect(readSheet(file.buffer as ArrayBuffer)).rejects.toThrow(/worker/)
  })

  it('reads every row on the main thread', async () => {
    vi.stubGlobal('Worker', class { constructor() { throw new Error('worker-src none') } })
    const { headers, rows: read } = tableToRows(await readXlsxSheet(file.buffer as ArrayBuffer))
    expect(read).toHaveLength(12_000)
    expect(rowsToPostings(read, guessMapping(headers))[11_999]).toMatchObject({ supplier: 'Kreditor 11999', amount: 11_999 * 1.25 })
  })
})
