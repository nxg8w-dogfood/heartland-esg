import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import type { ActivityLine } from '../calc/activity'
import { category5 } from '../calc/scope3'
import { groupLines } from './groupLines'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }
const results = category5([
  { id: 'a', group: 'k5-plast-gen', date: '2025-03-01', quantity: 1 },
  { id: 'b', group: 'k5-papir-gen', date: '2025-03-01', quantity: 2 },
  { id: 'c', group: 'k5-papir-gen', date: '2025-01-01', quantity: 4 },
  { id: 'd', group: 'k5-plast-gen', date: '2025-01-15', quantity: 8 },
] satisfies ActivityLine[], factors, year2025).lines

const ids = (sections: ReturnType<typeof groupLines>) => sections.map((s) => [s.label, s.lines.map((r) => r.line.id)])

describe('groupLines', () => {
  it('leaves the lines as entered without grouping', () => {
    expect(ids(groupLines(results, 'none'))).toEqual([[null, ['a', 'b', 'c', 'd']]])
  })

  it('groups by type, then date', () => {
    expect(ids(groupLines(results, 'type'))).toEqual([
      ['Pap/papir – genanvendelse', ['c', 'b']],
      ['Plast – genanvendelse', ['d', 'a']],
    ])
  })

  it('groups by month, then type', () => {
    expect(ids(groupLines(results, 'month'))).toEqual([
      ['jan 2025', ['c', 'd']],
      ['mar 2025', ['b', 'a']],
    ])
  })

  it('sums each group', () => {
    const [paper] = groupLines(results, 'type')
    expect(paper.quantity).toBe(6)
    expect(paper.unit).toBe('tonne')
    expect(paper.total).toBeCloseTo(paper.lines.reduce((t, r) => t + r.tCO2e, 0), 12)
  })
})
