/**
 * Faktorer's own pages: the emission factors, the index regulation of spend factors, and the
 * built-in factor table, where a factor without a value can be given one. Each has an address under `#/faktorer/`, like Scope 1's.
 */
export const factorsSubpages = [
  { id: 'faktorer', label: 'Emissionsfaktorer' },
  { id: 'indeksregulering', label: 'Indeksregulering' },
  { id: 'indbygget', label: 'Indbygget tabel' },
] as const

export type FactorsSubpageId = (typeof factorsSubpages)[number]['id']

/** The address of a Faktorer page; the emission factors are Faktorer's own address. */
export const factorsHref = (id: FactorsSubpageId) => (id === 'faktorer' ? '#/faktorer' : `#/faktorer/${id}`)

/** The sub-page that `#/faktorer/<id>` points at, or the emission factors when it points at none. */
export function factorsSubpageFromHash(hash: string): FactorsSubpageId {
  const [, sub] = hash.replace(/^#\/?/, '').split('/')
  return factorsSubpages.find((p) => p.id === sub)?.id ?? 'faktorer'
}
