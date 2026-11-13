import { describe, expect, it } from 'vitest'
import { searchFactors } from './factorSearch'

const f = (name: string, source: string, region: string) => ({ name, source, region })
const list = [
  f('Rådgivning', 'Exiobase 3.8', 'Danmark'),
  f('Software', 'Exiobase 3.8', 'Irland'),
  f('Kantine', 'DEFRA 2025', 'UK/generisk'),
]
const names = (q: string) => searchFactors(list, q).map((x) => x.name)

describe('searchFactors', () => {
  it('returns all factors, in order, for an empty or blank query', () => {
    expect(names('')).toEqual(['Rådgivning', 'Software', 'Kantine'])
    expect(names('   ')).toEqual(['Rådgivning', 'Software', 'Kantine'])
  })

  it('matches the name, the source and the country', () => {
    expect(names('soft')).toEqual(['Software'])
    expect(names('defra')).toEqual(['Kantine'])
    expect(names('irland')).toEqual(['Software'])
  })

  it('needs every word to match, across fields', () => {
    expect(names('exiobase danmark')).toEqual(['Rådgivning'])
    expect(names('exiobase uk')).toEqual([])
  })

  it('ignores case and accents', () => {
    expect(names('RADGIVNING')).toEqual(['Rådgivning'])
    expect(names('rådgiv')).toEqual(['Rådgivning'])
  })

  it('finds nothing when no factor matches', () => {
    expect(names('beton')).toEqual([])
  })
})
