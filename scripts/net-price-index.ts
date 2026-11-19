// `npm run npi`: fetches Danmarks Statistik's Net Price Index (PRIS05) and rewrites
// src/data/netPriceIndex.ts. Run it when a new year's average is out (January), and open a PR.

import { writeFileSync } from 'node:fs'
import { NPI_URL, npiModule, parseNpiCsv } from './lib/netPriceIndex.ts'

const res = await fetch(NPI_URL)
if (!res.ok) {
  console.error(`Danmarks Statistik answered ${res.status}: ${await res.text()}`)
  process.exit(1)
}
const points = parseNpiCsv(await res.text())
const file = new URL('../src/data/netPriceIndex.ts', import.meta.url)
writeFileSync(file, npiModule(points, new Date().toISOString().slice(0, 10)))
console.log(`Wrote ${points.length} years, ${points[0].year}-${points[points.length - 1].year}, to src/data/netPriceIndex.ts`)
