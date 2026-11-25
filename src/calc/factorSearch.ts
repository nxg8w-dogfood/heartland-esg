import type { Factor } from '../data/factors'

/**
 * The factors whose name, source or region (country) match every word of the query, ignoring
 * case and Danish/foreign accents. An empty query matches all. Order is kept.
 */
export function searchFactors<F extends Pick<Factor, 'name' | 'source' | 'region'>>(factors: readonly F[], query: string): F[] {
  return factors.filter((f) => matchesQuery(`${f.name} ${f.source} ${f.region}`, query))
}

/** Whether every word of the query is in the text, ignoring case and accents. An empty query matches. */
export function matchesQuery(text: string, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = fold(text)
  return words.every((w) => haystack.includes(w))
}

const fold = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('da')

/** The countries and areas the factors are for, alphabetically, each once. */
export function factorRegions(factors: readonly Pick<Factor, 'region'>[]): string[] {
  return [...new Set(factors.map((f) => f.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'da'))
}

/** The factors for one country or area, or all for '', by name. */
export function factorsInRegion<F extends Pick<Factor, 'name' | 'region'>>(factors: readonly F[], region: string): F[] {
  return factors
    .filter((f) => !region || f.region === region)
    .sort((a, b) => a.name.localeCompare(b.name, 'da') || a.region.localeCompare(b.region, 'da'))
}

/**
 * Each factor once, with a family of dated versions (the yearly grid mix, say) as its first
 * version: a line stores that id, and its date picks the version. Order is kept.
 */
export function oneOfEachFamily<F extends Pick<Factor, 'family'>>(factors: readonly F[]): F[] {
  const seen = new Set<string>()
  return factors.filter((f) => {
    if (!f.family) return true
    if (seen.has(f.family)) return false
    seen.add(f.family)
    return true
  })
}

/**
 * Whether a factor is per unit of money, so it fits an amount: its unit ends in a currency code
 * (kg CO2e/EUR, /GBP, /DKK …). Amounts are converted at the ECB's rate (docs/adr/0028).
 */
export const fitsAmount = (f: Pick<Factor, 'unit'>) => /\/[A-Z]{3}$/.test(f.unit)

/**
 * The year a factor is for: the price year of a spend factor, the first day of a dated version,
 * or a year in its source ("BEIS GHG Conversion Factors 2025"). For a family, the years it spans.
 * Null when nothing says.
 */
export function factorYear(f: Factor, all: readonly Factor[] = []): string | null {
  if (f.family) {
    const years = all.filter((x) => x.family === f.family).map((x) => x.validFrom?.slice(0, 4)).filter((y): y is string => !!y).sort()
    if (years.length > 1 && years[0] !== years[years.length - 1]) return `${years[0]}–${years[years.length - 1]}`
  }
  if (f.priceYear) return String(f.priceYear)
  if (f.validFrom) return f.validFrom.slice(0, 4)
  return f.source.match(/\b(19|20)\d{2}\b/)?.[0] ?? null
}

