// Factors calculated from other factors, so they follow whichever source is chosen for those.
//
// The DK-adjusted electric car: DESNZ gives kg CO2e per km on the UK grid. Dividing by the UK
// grid factor of the same DESNZ edition gives the car's electricity use per km, which is then
// multiplied by the Danish grid factor for the year. Both DESNZ figures are from the official
// flat files ("Business travel- land > Cars (by size) > Average car > Battery Electric
// Vehicle", per km, and "UK electricity > Electricity generated > Electricity: UK", per kWh).

export type DerivedFactor = {
  id: string
  /** kWh per km */
  kWhPerKm: number
  /** How kWhPerKm was found, shown as part of the source */
  basis: string
  /** The Danish grid factor for the same year */
  gridId: string
}

export const derivedFactors: readonly DerivedFactor[] = [
  { id: 'f-c-el-dk', kWhPerKm: 0.04047 / 0.177, basis: 'DESNZ 2025 (0,04047 ÷ 0,177)', gridId: 'f-s2-el-dk-2025' },
  { id: 'f-c-el-dk-2026', kWhPerKm: 0.02951 / 0.13096, basis: 'DESNZ 2026 (0,02951 ÷ 0,13096)', gridId: 'f-s2-el-dk-2026' },
]

/** Derived values are rounded to 5 decimals, as the original table's 0,01347 was. */
export const roundDerived = (v: number) => Math.round(v * 1e5) / 1e5
