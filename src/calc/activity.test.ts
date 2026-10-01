import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import { activityLine, activitySummary, factorOptions, type ActivityGroup, type ActivityLine } from './activity'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }
const hotel: ActivityGroup = { id: 'k6-hotel', label: 'Hotel', unit: 'værelsesnat', factorId: 'f-hotel-dk', factorChoices: 'Kat 6 – hotel' }
const train: ActivityGroup = { id: 'k6-tog', label: 'Tog', unit: 'passagerkm', factorId: 'f-t-tog' }
const line = (o: Partial<ActivityLine>): ActivityLine => ({ id: '1', group: 'k6-hotel', date: '2025-05-01', quantity: 10, ...o })

describe('factorOptions', () => {
  it('offers only the default factor when a group has no choices', () => {
    expect(factorOptions(train, factors).map((f) => f.id)).toEqual(['f-t-tog'])
  })

  it('offers every factor in the choice category, default first', () => {
    const ids = factorOptions(hotel, factors).map((f) => f.id)
    expect(ids[0]).toBe('f-hotel-dk')
    expect(ids).toHaveLength(9)
    expect(ids).toContain('f-hotel-de')
  })
})

describe('activityLine', () => {
  it('uses the group factor by default', () => {
    expect(activityLine(line({ group: 'k6-tog', quantity: 1000 }), train, factors, year2025).tCO2e).toBeCloseTo(0.03546, 12)
  })

  it('is pending on the Danish hotel factor, which BEIS does not have', () => {
    const r = activityLine(line({}), hotel, factors, year2025)
    expect(r.pending).toBe(true)
    expect(r.factor?.id).toBe('f-hotel-dk')
  })

  it('uses the factor chosen on the line, e.g. the hotel country', () => {
    const r = activityLine(line({ factorId: 'f-hotel-de' }), hotel, factors, year2025)
    expect(r.tCO2e).toBeCloseTo(0.132, 12)
    expect(r.factor?.region).toBe('Tyskland')
    expect(r.pending).toBe(false)
  })

  it('lets a custom factor override the chosen one', () => {
    expect(activityLine(line({ factorId: 'f-hotel-de', customFactor: 20 }), hotel, factors, year2025).tCO2e).toBeCloseTo(0.2, 12)
  })
})

describe('activitySummary', () => {
  it('throws on an unknown group rather than dropping the line', () => {
    expect(() => activitySummary([line({ group: 'nope' })], [hotel], factors, year2025)).toThrow('Unknown group: nope')
  })

  it('leaves out lines outside the period and counts pending ones', () => {
    const s = activitySummary([line({ id: 'a' }), line({ id: 'b', factorId: 'f-hotel-uk' }), line({ id: 'c', date: '2024-05-01' })], [hotel], factors, year2025)
    expect(s.lines.map((r) => r.line.id)).toEqual(['a', 'b'])
    expect(s.pendingCount).toBe(1)
    expect(s.total).toBeCloseTo(0.104, 12)
  })
})
