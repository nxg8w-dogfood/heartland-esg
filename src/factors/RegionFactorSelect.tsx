import { useState } from 'react'
import { factorRegions, factorsInRegion } from '../calc/factorSearch'
import type { Factor } from '../data/factors'
import { formatFactor } from '../format'

type Props = {
  /** The factor menu's id; the country menu gets `${id}-region` */
  id: string
  label: string
  factors: readonly Factor[]
  /** The chosen factor's id, or '' for none */
  value: string
  /** What '' means here, e.g. "Vælg faktor" or "Egen faktor" */
  emptyLabel: string
  onChange: (factorId: string) => void
  /** Show each factor's value in the menu */
  showValue?: boolean
  /** The label of a chosen factor that is no longer offered */
  keptLabel?: string
}

/**
 * Picks a factor in two steps: the country or area, then the type (the factor's name). The
 * country only narrows the second menu, so it isn't stored. It starts at the chosen factor's.
 */
export function RegionFactorSelect({ id, label, factors, value, emptyLabel, onChange, showValue, keptLabel }: Props) {
  const chosen = factors.find((f) => f.id === value)
  const [region, setRegion] = useState(chosen?.region ?? '')
  const regions = factorRegions(factors)
  const shown = factorsInRegion(factors, region)
  const name = (f: Factor, withRegion: boolean) =>
    `${f.name}${withRegion ? `, ${f.region}` : ''}${showValue ? ` · ${f.value === null ? 'værdi mangler' : formatFactor(f.value)}` : f.value === null ? ' (faktor mangler)' : ''}`

  return (
    <>
      <div className="field">
        <label htmlFor={`${id}-region`}>Land/område</label>
        <select id={`${id}-region`} value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">Alle lande og områder</option>
          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{emptyLabel}</option>
          {/* A chosen factor stays in the menu, even outside the country or no longer offered, so nothing changes silently. */}
          {value && !chosen && <option value={value}>{keptLabel || value}</option>}
          {chosen && !shown.includes(chosen) && <option value={chosen.id}>{name(chosen, true)}</option>}
          {shown.map((f) => <option key={f.id} value={f.id}>{name(f, !region)}</option>)}
        </select>
      </div>
    </>
  )
}
