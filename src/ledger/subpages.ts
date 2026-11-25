/**
 * Kontoplan's own pages: the postings (import and the posting list), the ESG owner's rules, and
 * the company's exceptions. Each has an address under `#/kontoplan/`, like Faktorer's.
 */
export const ledgerSubpages = [
  { id: 'posteringer', label: 'Posteringer' },
  { id: 'regler', label: 'Regler' },
  { id: 'undtagelser', label: 'Undtagelser' },
] as const

export type LedgerSubpageId = (typeof ledgerSubpages)[number]['id']

/** The address of a Kontoplan page; the postings are Kontoplan's own address. */
export const ledgerHref = (id: LedgerSubpageId) => (id === 'posteringer' ? '#/kontoplan' : `#/kontoplan/${id}`)

/** The sub-page that `#/kontoplan/<id>` points at, or the postings when it points at none. */
export function ledgerSubpageFromHash(hash: string): LedgerSubpageId {
  const [, sub] = hash.replace(/^#\/?/, '').split('/')
  return ledgerSubpages.find((p) => p.id === sub)?.id ?? 'posteringer'
}
