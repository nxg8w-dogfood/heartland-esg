import type { Factor } from '../data/factors'

/**
 * The factors a line may use instead of its default: the same factor for another region, such
 * as a hotel night per country or an EXIOBASE sector per country. They share the default's
 * scope, category, name and unit, so the line's type and quantity still fit. A family of date
 * versions, such as the yearly grid mix, is one choice; the line's date picks the version.
 * The default comes first. Empty when the default isn't in the table.
 */
export function factorChoices(defaultId: string, factors: readonly Factor[]): Factor[] {
  const own = factors.find((f) => f.id === defaultId)
  if (!own) return []
  const seenFamilies = new Set(own.family ? [own.family] : [])
  const others = factors.filter((f) => {
    if (f.id === own.id || f.scope !== own.scope || f.category !== own.category || f.name !== own.name || f.unit !== own.unit) return false
    if (!f.family) return true
    if (seenFamilies.has(f.family)) return false
    seenFamilies.add(f.family)
    return true
  })
  return [own, ...others]
}
