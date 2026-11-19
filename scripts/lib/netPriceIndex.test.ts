import { describe, expect, it } from 'vitest'
import { npiModule, parseNpiCsv } from './netPriceIndex.ts'

describe('parseNpiCsv', () => {
  it("reads Danmarks Statistik's CSV, BOM and Danish decimals included", () => {
    const csv = '\uFEFFTID;HOVED;INDHOLD\r\n2020;Årsgennemsnit;85,52\r\n2019;Årsgennemsnit;85,23\r\n'
    expect(parseNpiCsv(csv)).toEqual([{ year: 2019, value: 85.23 }, { year: 2020, value: 85.52 }])
  })

  it('refuses anything else, rather than writing a wrong index', () => {
    expect(() => parseNpiCsv('{"errorTypeCode":"EXTRACT-NOTALLOWED"}')).toThrow('Unexpected header')
    expect(() => parseNpiCsv('TID;HOVED;INDHOLD\n2019;Årsgennemsnit;..')).toThrow('Unexpected row')
  })
})

describe('npiModule', () => {
  it('writes the points and the fetch date', () => {
    const ts = npiModule([{ year: 2019, value: 85.23 }], '2026-11-19')
    expect(ts).toContain("export const NPI_FETCHED = '2026-11-19'")
    expect(ts).toContain('  { year: 2019, value: 85.23 },')
  })
})
