import type { Factor } from '../data/factors'

/**
 * The factors whose name, source or region (country) match every word of the query, ignoring
 * case and Danish/foreign accents. An empty query matches all. Order is kept.
 */
export function searchFactors<F extends Pick<Factor, 'name' | 'source' | 'region'>>(factors: readonly F[], query: string): F[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...factors]
  return factors.filter((f) => {
    const haystack = fold(`${f.name} ${f.source} ${f.region}`)
    return words.every((w) => haystack.includes(w))
  })
}

const fold = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('da')
