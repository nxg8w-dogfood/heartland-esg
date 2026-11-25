import type { Dispatch, SetStateAction } from 'react'
import type { Factor } from '../data/factors'
import type { FactorChoice } from './FactorCell'

type LineWithFactor = { id: string; factorId?: string | null }

/**
 * The factor picker for one line: every factor in the table whose unit is the default's, so the
 * line's quantity still fits, whatever its scope. Choosing the default stores nothing, so the
 * line follows the default if it changes.
 */
export function lineFactorChoice<L extends LineWithFactor>(
  line: L,
  defaultId: string,
  factors: readonly Factor[],
  setLines: Dispatch<SetStateAction<L[]>>,
  lineName: string,
): FactorChoice {
  const unit = factors.find((f) => f.id === defaultId)?.unit
  return {
    options: factors,
    fits: (f) => !!unit && f.unit === unit,
    selectedId: line.factorId ?? defaultId,
    onChoose: (id) => setLines((ls) => ls.map((l) => (l.id === line.id ? { ...l, factorId: id === defaultId ? null : id } : l))),
    lineName,
  }
}
