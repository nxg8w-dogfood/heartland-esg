import type { DrillNode } from '../calc/companyOverview'
import { categorySubpage, scope3Href } from '../scope3/subpages'

/** The app page where a node's figures are entered */
export function nodeHref(node: DrillNode): string | null {
  if (node.id.startsWith('s1')) return '#/scope1'
  if (node.id.startsWith('s2')) return '#/scope2'
  if (node.nr !== undefined) {
    const sub = categorySubpage(node.nr)
    return sub ? scope3Href(sub.id) : scope3Href('indstillinger')
  }
  if (node.id.startsWith('s3')) return '#/scope3'
  return null
}
