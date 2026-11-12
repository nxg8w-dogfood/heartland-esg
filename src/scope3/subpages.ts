/**
 * Scope 3's own pages: an overview, one page per category the app calculates, and the settings
 * last. Each has an address under `#/scope3/`, so a page can be linked to and survives a reload.
 */
export const scope3Subpages = [
  { id: 'oversigt', label: 'Oversigt' },
  { id: 'kategori-1', label: '1 — Indkøb', nr: 1 },
  { id: 'kategori-2', label: '2 — Kapitalgoder', nr: 2 },
  { id: 'kategori-3', label: '3 — Brændstof og energi', nr: 3 },
  { id: 'kategori-4', label: '4 — Transport', nr: 4 },
  { id: 'kategori-5', label: '5 — Affald', nr: 5 },
  { id: 'kategori-6', label: '6 — Forretningsrejser', nr: 6 },
  { id: 'kategori-7', label: '7 — Pendling', nr: 7 },
  { id: 'kategori-15', label: '15 — Investeringer', nr: 15 },
  { id: 'indstillinger', label: 'Indstillinger' },
] as const

export type Scope3SubpageId = (typeof scope3Subpages)[number]['id']

/** The address of a Scope 3 page; the overview is Scope 3's own address. */
export const scope3Href = (id: Scope3SubpageId) => (id === 'oversigt' ? '#/scope3' : `#/scope3/${id}`)

/** The sub-page that `#/scope3/<id>` points at, or the overview when it points at none. */
export function scope3SubpageFromHash(hash: string): Scope3SubpageId {
  const [, sub] = hash.replace(/^#\/?/, '').split('/')
  return scope3Subpages.find((p) => p.id === sub)?.id ?? 'oversigt'
}

/** The page for a category, if it has one. */
export const categorySubpage = (nr: number) => scope3Subpages.find((p) => 'nr' in p && p.nr === nr)
