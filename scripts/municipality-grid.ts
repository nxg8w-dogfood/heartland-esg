// `npm run municipality-grid [years…]`: computes the location-based electricity factor per
// municipality from Energi Data Service and rewrites src/data/municipalityGrid.ts (ADR 0031).
// Run it when Energinet finalises a year (spring), with every year to keep, e.g.
//   npm run municipality-grid 2022 2023 2024 2025
// Energi Data Service limits requests hard, so the script waits when told to and takes a while.

import { writeFileSync } from 'node:fs'
import { EDS, hoursIn, municipalityGridModule, yearlyFactors, type ReCoverageRow, type TransmissionRow } from './lib/municipalityGrid.ts'

const years = process.argv.slice(2).map(Number)
if (!years.length || years.some((y) => !Number.isInteger(y) || y < 2015)) {
  console.error('Give the years to include, e.g. npm run municipality-grid 2022 2023 2024 2025')
  process.exit(1)
}

const pause = (s: number) => new Promise((r) => setTimeout(r, s * 1000))

async function records<T>(dataset: string, query: string): Promise<T[]> {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(`${EDS}/${dataset}?${query}&limit=0`)
    if (res.status === 429) {
      const wait = Number(/(\d+) seconds/.exec(await res.text())?.[1] ?? 60) + 5
      console.log(`${dataset}: rate-limited, waiting ${wait} s`)
      await pause(wait)
      continue
    }
    if (!res.ok) throw new Error(`${dataset} answered ${res.status}: ${await res.text()}`)
    return ((await res.json()) as { records: T[] }).records
  }
  throw new Error(`${dataset}: still rate-limited after 6 attempts`)
}

const values: Record<string, (number | null)[]> = {}
for (const [i, year] of years.entries()) {
  // Energinet's year is the Danish calendar year, which is how the API reads start and end.
  const span = `start=${year}-01-01T00:00&end=${year + 1}-01-01T00:00`
  const re = await records<ReCoverageRow>('ReCoverageMunicipality', `${span}&columns=HourUTC,MunicipalityNo,REshare,ConsumptionkWh`)
  await pause(15)
  const transmission = await records<TransmissionRow>('DeclarationTransmissionEmission', `${span}&filter=${encodeURIComponent('{"FuelAllocationMethod":["125%"]}')}`)
  await pause(15)
  const factors = yearlyFactors(re, transmission)
  // A year Energinet hasn't finished has missing hours: every municipality gets null for it.
  const complete = new Set(transmission.map((t) => `${t.HourUTC}|${t.PriceArea}`)).size === 2 * hoursIn(year)
  for (const [no, g] of factors) (values[no] ??= years.map(() => null))[i] = complete ? g : null
  console.log(`${year}: ${factors.size} municipalities, ${re.length} hourly rows${complete ? '' : ' — incomplete year, left out'}`)
}

const file = new URL('../src/data/municipalityGrid.ts', import.meta.url)
writeFileSync(file, municipalityGridModule(years, values, new Date().toISOString().slice(0, 10)))
console.log(`Wrote ${Object.keys(values).length} municipalities to src/data/municipalityGrid.ts`)
