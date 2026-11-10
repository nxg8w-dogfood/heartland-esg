import type { Factor } from '../data/factors'
import { formatFactor } from '../format'
import { factorLabel } from './label'

/** The factors a line may switch between, and what to do when one is chosen. */
export type FactorChoice = {
  options: readonly Factor[]
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
  /** Shown as a dropdown when there is more than one factor to choose from */
  choice?: FactorChoice
}

/** A line's emission factor: its value, which factor it is, and where the value comes from. */
export function FactorCell({ value, factor, custom = false, choice }: Props) {
  const name = choice && choice.options.length > 1 ? <FactorSelect {...choice} /> : <FactorName factor={factor} />
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
    </>
  )
}

function FactorName({ factor }: { factor: Factor | null }) {
  const label = factorLabel(factor)
  return label ? <span className="sub">{label}</span> : null
}

function FactorSelect({ options, selectedId, onChoose, lineName }: FactorChoice) {
  // A line saved with a factor that is no longer offered keeps it, so nothing changes silently.
  const selected = options.find((f) => f.id === selectedId)
  return (
    <select
      className="factor-choice"
      aria-label={`Emissionsfaktor for ${lineName}`}
      value={selectedId}
      onChange={(e) => onChoose(e.target.value)}
    >
      {!selected && <option value={selectedId}>{selectedId}</option>}
      {options.map((f) => (
        <option key={f.id} value={f.id}>
          {factorLabel(f)}{f.value === null ? ' (afventer)' : ''}
        </option>
      ))}
    </select>
  )
}
