import type { Factor } from '../data/factors'
import { formatFactor } from '../format'
import { factorLabel } from './label'

type Props = {
  /** The value used on the line: the factor's own, or one entered on the line */
  value: number | null
  factor: Factor | null
  /** The line overrides the factor's value with its own */
  custom?: boolean
}

/** A line's emission factor: its value, which factor it is, and where the value comes from. */
export function FactorCell({ value, factor, custom = false }: Props) {
  const label = factorLabel(factor)
  if (value === null) {
    return (
      <>
        <span className="pending">Faktor mangler</span>
        {label && <span className="sub">{label}</span>}
      </>
    )
  }
  const source = custom ? 'Egen faktor' : factor?.source
  return (
    <>
      {formatFactor(value)}
      {label && <span className="sub">{label}</span>}
      {source && <span className="sub">{source}</span>}
    </>
  )
}
