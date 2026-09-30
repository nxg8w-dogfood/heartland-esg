// Emissions for a single accounting line, ported from the original app's
// per-line calculation (the compiled bundle ADR 0001 treats as the spec).
// Spend-based lines (currency conversion and price deflation) are not ported yet.

export type EmissionFactor = {
  /** Factor value in kg CO2e per unit, e.g. 2.57082 */
  value: number | null
  /** Unit of the factor, e.g. "kg CO2e/liter" */
  unit: string
}

export type DirectLine = {
  method: 'direct'
  /** Emissions entered directly, in tCO2e */
  tCO2e: number | null
}

export type ActivityLine = {
  method: 'activity'
  /** Activity quantity, in the line's unit */
  quantity: number | null
  /** Unit of the quantity, e.g. "liter" */
  unit: string
  factor: EmissionFactor | null
  /** A factor entered on the line; overrides factor.value */
  customFactor?: number | null
}

export type Line = DirectLine | ActivityLine

export type LineResult = {
  tCO2e: number
  /** Quantity attributed to the reporting period (activity lines only) */
  quantityInPeriod: number | null
  /** True when the line can't be calculated yet because data is missing */
  pending: boolean
  warning: string | null
}

const finiteOrZero = (n: number | null | undefined): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : 0

/** The unit a factor is expressed per: "kg CO2e/liter" -> "liter". */
export function factorDenominator(unit: string): string {
  const slash = unit.indexOf('/')
  return slash === -1 ? unit : unit.slice(slash + 1)
}

/**
 * @param periodShare Share of the line that falls inside the reporting period, 0 to 1.
 */
export function lineEmissions(line: Line, periodShare: number): LineResult {
  if (line.method === 'direct') {
    return {
      tCO2e: finiteOrZero(line.tCO2e) * periodShare,
      quantityInPeriod: null,
      pending: line.tCO2e === null,
      warning: null,
    }
  }

  const factorValue = line.customFactor ?? line.factor?.value ?? null
  const quantityInPeriod = line.quantity === null ? null : line.quantity * periodShare
  const denominator = line.factor ? factorDenominator(line.factor.unit) : ''
  const unitMismatch = line.factor && denominator && line.unit && denominator !== line.unit

  return {
    // Factors are kg CO2e per unit; results are tonnes.
    tCO2e: (finiteOrZero(quantityInPeriod) * finiteOrZero(factorValue)) / 1000,
    quantityInPeriod,
    pending: factorValue === null && finiteOrZero(line.quantity) !== 0,
    warning: unitMismatch
      ? `Faktorens enhed er ${line.factor!.unit}, men linjen er angivet i ${line.unit}.`
      : null,
  }
}
