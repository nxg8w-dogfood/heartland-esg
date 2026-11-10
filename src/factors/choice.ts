import type { Dispatch, SetStateAction } from 'react'
import { factorChoices } from '../calc/factorChoices'
import type { Factor } from '../data/factors'
import type { FactorChoice } from './FactorCell'

type LineWithFactor = { id: string; factorId?: string | null }

/**
 * The dropdown for one line: the factors it may use, and an update that stores the choice on
 * the line. Choosing the default stores nothing, so the line follows the default if it changes.
 */
export function lineFactorChoice<L extends LineWithFactor>(
  line: L,
  defaultId: string,
  factors: readonly Factor[],
  setLines: Dispatch<SetStateAction<L[]>>,
  lineName: string,
): FactorChoice {
  return {
    options: factorChoices(defaultId, factors),
    selectedId: line.factorId ?? defaultId,
    onChoose: (id) => setLines((ls) => ls.map((l) => (l.id === line.id ? { ...l, factorId: id === defaultId ? null : id } : l))),
    lineName,
  }
}
