import type { Factor } from '../data/factors'
import { dayValue } from './dates'

/**
 * The factor to use for a line, ported from the original app. A factor in a family (such as
 * the yearly Danish grid mix) is swapped for the family member valid on the line's date.
 * If none is valid on that date, the family's last member is used.
 */
export function findFactor(
  factors: readonly Factor[],
  id: string | null | undefined,
  date: string,
): Factor | null {
  if (!id) return null
  const factor = factors.find((f) => f.id === id)
  if (!factor) return null
  if (!factor.family) return factor

  const day = dayValue(date)
  const family = factors.filter((f) => f.family === factor.family)
  return (
    family.find(
      (f) =>
        (!f.validFrom || dayValue(f.validFrom) <= day) && (!f.validTo || dayValue(f.validTo) >= day),
    ) ??
    family[family.length - 1] ??
    factor
  )
}
