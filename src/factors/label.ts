import type { Factor } from '../data/factors'

/** Regions that say nothing about where the activity happened, so they are left out of the label. */
const genericRegions = new Set(['', '—', 'UK/generisk', 'Global'])

/**
 * What a factor is, as shown next to its value, just above its source: the name from the
 * factor table, with the region when it narrows the factor down (hotels per country, the Danish
 * grid). The original shows the same as "type (land)" on the factor's hover card.
 */
export function factorLabel(factor: Factor | null | undefined): string {
  if (!factor) return ''
  const region = genericRegions.has(factor.region) ? '' : ` (${factor.region})`
  return `${factor.name}${region}`
}
