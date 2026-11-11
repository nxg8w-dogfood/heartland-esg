/** The app's top-level pages, in the order of the header navigation. */
export const pages = [
  { id: 'koncern', label: 'Koncern' },
  { id: 'bilpark', label: 'Bilpark' },
  { id: 'scope1', label: 'Scope 1' },
  { id: 'scope2', label: 'Scope 2' },
  { id: 'scope3', label: 'Scope 3' },
  { id: 'kontoplan', label: 'Kontoplan' },
  { id: 'faktorer', label: 'Faktorer' },
] as const
export type PageId = (typeof pages)[number]['id']
export type CompanyPageId = Exclude<PageId, 'koncern'>

/** The page `#/<page>` or `#/<page>/<sub-page>` points at; Scope 1 when it points at none. */
export const pageFromHash = (hash: string): PageId => {
  const [id] = hash.replace(/^#\/?/, '').split('/')
  return pages.some((p) => p.id === id) ? (id as PageId) : 'scope1'
}
