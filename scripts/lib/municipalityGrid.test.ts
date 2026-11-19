import { describe, expect, it } from 'vitest'
import { hoursIn, municipalityGridModule, priceAreaOf, yearlyFactors, type ReCoverageRow, type TransmissionRow } from './municipalityGrid.ts'

const re = (MunicipalityNo: string, HourUTC: string, ConsumptionkWh: number, REshare: number): ReCoverageRow => ({ HourUTC, MunicipalityNo, REshare, ConsumptionkWh })
const tx = (PriceArea: string, HourUTC: string, CO2PerkWh: number, o: Partial<TransmissionRow> = {}): TransmissionRow => ({
  HourUTC, PriceArea, FuelAllocationMethod: '125%', Version: 'Final', CO2PerkWh, CH4PerkWh: 0, N2OPerkWh: 0, ...o,
})

describe('yearlyFactors', () => {
  it("weights each hour by consumption and takes out the local renewables' share", () => {
    const f = yearlyFactors(
      [re('101', 'h1', 100, 50), re('101', 'h2', 300, 0)],
      [tx('DK2', 'h1', 100), tx('DK2', 'h2', 200)],
    )
    // (100 × 0.5 × 100 + 300 × 1 × 200) / 400
    expect(f.get('101')).toBeCloseTo(162.5, 12)
  })

  it('adds methane and nitrous oxide, given in mg/kWh, at GWP 28 and 265', () => {
    expect(yearlyFactors([re('751', 'h', 1, 0)], [tx('DK1', 'h', 50, { CH4PerkWh: 1000, N2OPerkWh: 100 })]).get('751')).toBeCloseTo(50 + 28 + 26.5, 12)
  })

  it("uses the municipality's price area, the latest version, and only the 125 % method", () => {
    const f = yearlyFactors([re('101', 'h', 1, 0), re('751', 'h', 1, 0)], [
      tx('DK2', 'h', 10, { Version: 'Preliminary' }), tx('DK2', 'h', 20), tx('DK2', 'h', 99, { FuelAllocationMethod: '200%' }), tx('DK1', 'h', 30, { Version: 'Initial' }),
    ])
    expect(f.get('101')).toBe(20)
    expect(f.get('751')).toBe(30)
  })

  it('gives no figure for a municipality with an hour without emissions, or without consumption', () => {
    const f = yearlyFactors([re('101', 'h1', 1, 0), re('101', 'h2', 1, 0), re('147', 'h1', 0, 0)], [tx('DK2', 'h1', 10)])
    expect(f.get('101')).toBeNull()
    expect(f.get('147')).toBeNull()
  })
})

it('puts municipalities up to 400 in DK2, as Energi Data Service documents', () => {
  expect([priceAreaOf('101'), priceAreaOf('400'), priceAreaOf('410'), priceAreaOf('751')]).toEqual(['DK2', 'DK2', 'DK1', 'DK1'])
  expect([hoursIn(2024), hoursIn(2025)]).toEqual([8784, 8760])
})

it('writes the values to two decimals, with null for a missing year', () => {
  const ts = municipalityGridModule([2024, 2025], { '751': [90.5187, null], '101': [48.15648, 48.10183] }, '2026-11-19')
  expect(ts).toContain('export const municipalityGridYears: readonly number[] = [2024, 2025]')
  expect(ts.indexOf("'101'")).toBeLessThan(ts.indexOf("'751'"))
  expect(ts).toContain("  '101': [48.16, 48.10],")
  expect(ts).toContain("  '751': [90.52, null],")
})
