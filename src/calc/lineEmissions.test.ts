import { describe, expect, it } from 'vitest'
import { factorDenominator, lineEmissions, type ActivityLine } from './lineEmissions'

// Diesel factor as shipped in the original app's factor table.
const diesel = { value: 2.57082, unit: 'kg CO2e/liter' }

const activity = (overrides: Partial<ActivityLine> = {}): ActivityLine => ({
  method: 'activity',
  quantity: 1000,
  unit: 'liter',
  factor: diesel,
  ...overrides,
})

describe('lineEmissions, activity lines', () => {
  it('multiplies quantity by factor and converts kg to tonnes', () => {
    const r = lineEmissions(activity(), 1)
    expect(r.tCO2e).toBeCloseTo(2.57082, 10)
    expect(r.quantityInPeriod).toBe(1000)
    expect(r.pending).toBe(false)
    expect(r.warning).toBeNull()
  })

  it('attributes only the period share of the quantity', () => {
    const r = lineEmissions(activity(), 0.25)
    expect(r.quantityInPeriod).toBe(250)
    expect(r.tCO2e).toBeCloseTo(0.642705, 10)
  })

  it('gives zero for a line entirely outside the period', () => {
    expect(lineEmissions(activity(), 0).tCO2e).toBe(0)
  })

  it('prefers a custom factor on the line over the table factor', () => {
    expect(lineEmissions(activity({ customFactor: 3 }), 1).tCO2e).toBe(3)
  })

  it('treats a custom factor of 0 as a real value, not as missing', () => {
    const r = lineEmissions(activity({ customFactor: 0 }), 1)
    expect(r.tCO2e).toBe(0)
    expect(r.pending).toBe(false)
  })

  it('is pending when there is a quantity but no factor', () => {
    const r = lineEmissions(activity({ factor: null }), 1)
    expect(r.tCO2e).toBe(0)
    expect(r.pending).toBe(true)
  })

  it('is pending when the factor has no value yet', () => {
    expect(lineEmissions(activity({ factor: { value: null, unit: 'kg CO2e/liter' } }), 1).pending).toBe(true)
  })

  it('is not pending when there is no factor and nothing to multiply', () => {
    expect(lineEmissions(activity({ factor: null, quantity: 0 }), 1).pending).toBe(false)
    expect(lineEmissions(activity({ factor: null, quantity: null }), 1).pending).toBe(false)
  })

  it('keeps a missing quantity as null rather than zero', () => {
    const r = lineEmissions(activity({ quantity: null }), 1)
    expect(r.quantityInPeriod).toBeNull()
    expect(r.tCO2e).toBe(0)
  })

  it('treats non-finite input as zero instead of propagating NaN', () => {
    expect(lineEmissions(activity({ quantity: Number.NaN }), 1).tCO2e).toBe(0)
    expect(lineEmissions(activity({ customFactor: Number.POSITIVE_INFINITY }), 1).tCO2e).toBe(0)
  })

  it('handles negative quantities, such as corrections, without clamping', () => {
    expect(lineEmissions(activity({ quantity: -1000 }), 1).tCO2e).toBeCloseTo(-2.57082, 10)
  })

  it('warns when the line unit differs from the factor unit', () => {
    const r = lineEmissions(activity({ unit: 'kWh' }), 1)
    expect(r.warning).toBe('Faktorens enhed er kg CO2e/liter, men linjen er angivet i kWh.')
    // The number is still calculated; the warning is for the user to act on.
    expect(r.tCO2e).toBeCloseTo(2.57082, 10)
  })

  it('does not warn when the line has no unit', () => {
    expect(lineEmissions(activity({ unit: '' }), 1).warning).toBeNull()
  })
})

describe('lineEmissions, direct lines', () => {
  it('scales directly entered tCO2e by the period share', () => {
    const r = lineEmissions({ method: 'direct', tCO2e: 12 }, 0.5)
    expect(r.tCO2e).toBe(6)
    expect(r.pending).toBe(false)
    expect(r.quantityInPeriod).toBeNull()
  })

  it('is pending when no value has been entered', () => {
    const r = lineEmissions({ method: 'direct', tCO2e: null }, 1)
    expect(r.tCO2e).toBe(0)
    expect(r.pending).toBe(true)
  })
})

describe('factorDenominator', () => {
  it('returns the unit after the slash', () => {
    expect(factorDenominator('kg CO2e/liter')).toBe('liter')
    expect(factorDenominator('kg CO2e/EUR')).toBe('EUR')
  })

  it('returns the whole unit when there is no slash', () => {
    expect(factorDenominator('kWh')).toBe('kWh')
  })
})
