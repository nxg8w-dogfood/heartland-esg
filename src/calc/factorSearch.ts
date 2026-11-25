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
