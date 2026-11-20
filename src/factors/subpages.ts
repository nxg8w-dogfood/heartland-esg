/**
 * Faktorer's own pages: the emission factors, and the index regulation of spend factors, which
 * brings amounts to a factor's price year. Each has an address under `#/faktorer/`, like Scope 1's.
 */
export const factorsSubpages = [
  { id: 'faktorer', label: 'Emissionsfaktorer' },
  { id: 'indeksregulering', label: 'Indeksregulering' },
] as const

export type FactorsSubpageId = (typeof factorsSubpages)[number]['id']

/** The address of a Faktorer page; the emission factors are Faktorer's own address. */
export const factorsHref = (id: FactorsSubpageId) => (id === 'faktorer' ? '#/faktorer' : `#/faktorer/${id}`)

/** The sub-page that `#/faktorer/<id>` points at, or the emission factors when it points at none. */
export function factorsSubpageFromHash(hash: string): FactorsSubpageId {
  const [, sub] = hash.replace(/^#\/?/, '').split('/')
  return factorsSubpages.find((p) => p.id === sub)?.id ?? 'faktorer'
}
