/**
 * Scope 1's own pages: the emission lines, and the company's cars (Bilpark), which the lines
 * entered in km refer to. Each has an address under `#/scope1/`, like Scope 3's pages.
 */
export const scope1Subpages = [
  { id: 'udledninger', label: 'Udledninger' },
  { id: 'bilpark', label: 'Bilpark' },
] as const

export type Scope1SubpageId = (typeof scope1Subpages)[number]['id']

/** The address of a Scope 1 page; the emission lines are Scope 1's own address. */
export const scope1Href = (id: Scope1SubpageId) => (id === 'udledninger' ? '#/scope1' : `#/scope1/${id}`)

/** The sub-page that `#/scope1/<id>` points at, or the emission lines when it points at none. */
export function scope1SubpageFromHash(hash: string): Scope1SubpageId {
  const [, sub] = hash.replace(/^#\/?/, '').split('/')
  return scope1Subpages.find((p) => p.id === sub)?.id ?? 'udledninger'
}
