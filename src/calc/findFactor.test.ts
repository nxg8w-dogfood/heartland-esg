import { describe, expect, it } from 'vitest'
import { factors, type Factor } from '../data/factors'
import { findFactor } from './findFactor'

describe('findFactor', () => {
  it('returns a factor that has no family as it is', () => {
    expect(findFactor(factors, 'f-s1-diesel', '2025-06-01')?.value).toBe(2.57082)
  })

  it('picks the family member valid on the line date', () => {
    // Danish grid mix: 2024 and 2025 declarations are one family.
    expect(findFactor(factors, 'f-s2-el-dk-2025', '2024-06-01')?.id).toBe('f-s2-el-dk-2024')
    expect(findFactor(factors, 'f-s2-el-dk-2024', '2025-06-01')?.id).toBe('f-s2-el-dk-2025')
  })

  it("falls back to the family's last member when none is valid on the date", () => {
    expect(findFactor(factors, 'f-s2-el-dk-2024', '2031-01-01')?.id).toBe('f-s2-el-dk-2025')
    expect(findFactor(factors, 'f-s2-el-dk-2025', '2019-01-01')?.id).toBe('f-s2-el-dk-2025')
  })

  it('returns null for a missing or unknown id', () => {
    expect(findFactor(factors, null, '2025-01-01')).toBeNull()
    expect(findFactor(factors, 'f-does-not-exist', '2025-01-01')).toBeNull()
  })

  it('treats validity dates as inclusive', () => {
    const family: Factor[] = [
      { id: 'a', scope: 'Scope 2', category: 'x', name: 'A', region: '', unit: 'kg CO2e/kWh', value: 1, source: '', reference: '', family: 'f', validFrom: '2025-01-01', validTo: '2025-06-30' },
      { id: 'b', scope: 'Scope 2', category: 'x', name: 'B', region: '', unit: 'kg CO2e/kWh', value: 2, source: '', reference: '', family: 'f', validFrom: '2025-07-01' },
    ]
    expect(findFactor(family, 'b', '2025-06-30')?.id).toBe('a')
    expect(findFactor(family, 'a', '2025-07-01')?.id).toBe('b')
  })
})

describe('factor table', () => {
  it('has unique ids', () => {
    expect(new Set(factors.map((f) => f.id)).size).toBe(factors.length)
  })

  it('has a unit in "kg CO2e/<unit>" form for every activity factor with a value', () => {
    const parameters = new Set(['andel', 'ratio'])
    for (const f of factors) {
      if (f.method === 'spend' || parameters.has(f.unit)) continue
      expect(f.unit, f.id).toMatch(/^kg CO2e\/.+/)
    }
  })

  it('keeps the original Scope 1 values', () => {
    const value = (id: string) => factors.find((f) => f.id === id)?.value
    expect(value('f-s1-diesel')).toBe(2.57082)
    expect(value('f-s1-benzin')).toBe(2.06916)
    expect(value('f-s1-naturgas')).toBe(2.06672)
    expect(value('f-s1-gasolie')).toBe(2.75541)
    expect(value('f-s1-hfc134a')).toBe(1300)
    expect(value('f-s1-koel-andet')).toBeNull()
  })
})
