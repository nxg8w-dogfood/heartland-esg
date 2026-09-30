import { describe, expect, it } from 'vitest'
import { parseNumber } from './parseNumber'

describe('parseNumber', () => {
  it.each([
    ['1234', 1234],
    ['1234,5', 1234.5],
    ['1.234,5', 1234.5],
    ['1.234.567,89', 1234567.89],
    ['1 234,5', 1234.5],
    ['1 234,5', 1234.5],
    ['1.000', 1000],
    ['12.345.678', 12345678],
    ['2.5', 2.5],
    ['0,25', 0.25],
    ['-120', -120],
    ['-1.234,5', -1234.5],
    ['  42  ', 42],
    ['0', 0],
  ])('reads %j as %d', (input, expected) => {
    expect(parseNumber(input)).toBe(expected)
  })

  it('returns null for empty input', () => {
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('   ')).toBeNull()
  })

  it.each(['abc', '1,2,3', '1.23,4', '12,', ',5', '1e3', '--1', '1-2', 'NaN', 'Infinity'])(
    'returns NaN for %j so the line is flagged, not counted as 0',
    (input) => {
      expect(parseNumber(input)).toBeNaN()
    },
  )
})
