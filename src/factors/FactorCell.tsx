import { useId } from 'react'
import type { Factor } from '../data/factors'
import { FactorSearchSelect } from './FactorSearch'
import type { DeflationResult } from '../calc/spend'
import { formatFactor } from '../format'
import { factorLabel } from './label'

/** The factors a line may switch between, and what to do when one is chosen. */
export type FactorChoice = {
  /** The factor table */
  options: readonly Factor[]
  /** The factors that fit the line: the same unit as its default */
  fits: (f: Factor) => boolean
  /** The id the line uses (a family's id, not the dated version), or the default */
  selectedId: string
  onChoose: (id: string) => void
  /** Names the line for screen readers, e.g. "Firmabiler – diesel, 01.01.2025" */
  lineName: string
}

type Props = {
  /** The value used on the line: the factor's own, or one entered on the line */
  value: number | null
  factor: Factor | null
  /** The line overrides the factor's value with its own */
  custom?: boolean
  /** Shown as a factor search when there is another factor that fits the line */
  choice?: FactorChoice
  /** A spend factor's index regulation; when applied, the regulated value is shown instead */
  regulation?: { result: DeflationResult; value: number | null }
}

/** A line's emission factor: its value, which factor it is, and where the value comes from. */
export function FactorCell({ value: own, factor, custom = false, choice, regulation }: Props) {
  const regulated = regulation?.result.status === 'applied'
  const value = regulated ? regulation!.value : own
  const name = choice && choice.options.some((f) => f.id !== choice.selectedId && choice.fits(f)) ? <LineFactorSearch {...choice} /> : <FactorName factor={factor} />
  if (value === null) {
    return (
      <>
        <span className="pending">Faktor mangler</span>
        {name}
      </>
    )
  }
  const source = custom ? 'Egen faktor' : factor?.source
  return (
    <>
      {formatFactor(value)}
      {name}
      {source && <span className="sub">{source}</span>}
      {regulated && (
        <span className="sub">
          <a href="#/faktorer/indeksregulering">Indeksreguleret</a> til {regulation!.result.year}
        </span>
      )}
    </>
  )
}

function FactorName({ factor }: { factor: Factor | null }) {
  const label = factorLabel(factor)
  return label ? <span className="sub">{label}</span> : null
}

function LineFactorSearch({ options, fits, selectedId, onChoose, lineName }: FactorChoice) {
  const id = useId()
  // A line saved with a factor that is no longer in the table keeps it, so nothing changes silently.
  return (
    <FactorSearchSelect
      id={`${id}-factor`} label={`Emissionsfaktor for ${lineName}`} hideLabel factors={options} fits={fits} misfit="Anden enhed"
      value={selectedId} emptyLabel="Vælg faktor" keptLabel={selectedId} showValue={false} onChange={(v) => { if (v) onChoose(v) }}
    />
  )
}
