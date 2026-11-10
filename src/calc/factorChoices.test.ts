import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import { factorChoices } from './factorChoices'
import { scope1Line } from './scope1'

const ids = (defaultId: string) => factorChoices(defaultId, factors).map((f) => f.id)

describe('factorChoices', () => {
  it('offers the factors in the same category and unit, default first', () => {
    expect(ids('f-s1-benzin')).toEqual(['f-s1-benzin', 'f-s1-diesel'])
    expect(ids('f-s1-hfc134a')).toEqual(['f-s1-hfc134a', 'f-s1-koel-andet'])
  })

  it('leaves out factors in another unit, so the quantity still fits', () => {
    // Natural gas (m³) and gas oil (liter) share the category "Stationær forbrænding".
    expect(ids('f-s1-naturgas')).toEqual(['f-s1-naturgas'])
    expect(ids('f-s1-gasolie')).toEqual(['f-s1-gasolie'])
    // Company cars per km are not offered on a flight per passenger-km.
    expect(ids('f-t-fly-kort')).not.toContain('f-t-bil-diesel')
  })

  it('offers a family of date versions once', () => {
    expect(ids('f-s2-el-residual')).toEqual(['f-s2-el-residual', 'f-s2-el-ppa', 'f-s2-el-go'])
    expect(ids('f-s2-el-dk-2025')).toEqual(['f-s2-el-dk-2025'])
  })

  it('offers every EXIOBASE sector for a purchase', () => {
    const exiobase = factors.filter((f) => f.category === 'Spendfaktor (EXIOBASE)')
    expect(ids('f-exio-obs-dk')).toHaveLength(exiobase.length)
    expect(ids('f-exio-obs-dk')[0]).toBe('f-exio-obs-dk')
  })

  it('is empty for an unknown factor', () => {
    expect(factorChoices('nope', factors)).toEqual([])
  })
})

describe('a Scope 1 line with a chosen factor', () => {
  const year2025 = { start: '2025-01-01', end: '2025-12-31' }

  it('uses the chosen factor instead of the group default', () => {
    const r = scope1Line({ id: '1', group: 's1-diesel', date: '2025-03-15', quantity: 1000, factorId: 'f-s1-benzin' }, factors, year2025)
    expect(r.factor?.id).toBe('f-s1-benzin')
    expect(r.tCO2e).toBeCloseTo(2.06916, 10)
  })
})
