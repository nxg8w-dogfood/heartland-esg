import { useId, useState } from 'react'
import type { MonthValue } from '../calc/companyOverview'
import { formatNumber } from '../format'

/**
 * A figure per month as columns, one series in one hue. Hover or focus a column for its value;
 * each column also carries its value for screen readers. `compact` is the small-multiples size.
 */
export function MonthChart({ title, subtitle, unit, months, decimals = 3, compact = false }: {
  title: string
  subtitle?: string
  unit: string
  months: MonthValue[]
  decimals?: number
  compact?: boolean
}) {
  const id = useId()
  const [active, setActive] = useState<number | null>(null)
  if (months.length < 2) return null
  const n = (v: number) => formatNumber(v, decimals)
  const max = Math.max(0, ...months.map((m) => m.value))
  const shown = active === null ? null : months[active]
  return (
    <figure className={compact ? 'month-chart compact' : 'month-chart'} aria-labelledby={`${id}-title`}>
      <figcaption id={`${id}-title`}>
        <strong>{title}</strong> {subtitle && <span className="muted">{subtitle}</span>}
      </figcaption>
      <p className="month-readout" aria-live="polite">
        {shown ? (
          <><strong>{n(shown.value)}</strong> <span className="muted">{unit}, {shown.label}</span></>
        ) : (
          <span className="muted">Højeste måned: {n(max)} {unit}</span>
        )}
      </p>
      <div className="month-columns" onPointerLeave={() => setActive(null)}>
        {months.map((m, i) => (
          <div
            key={m.start}
            className={i === active ? 'month active' : 'month'}
            tabIndex={0}
            role="img"
            aria-label={`${m.label}: ${n(m.value)} ${unit}`}
            onPointerEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          >
            <span className="column-track">
              <span className="column" style={{ height: max > 0 ? `${(Math.max(0, m.value) / max) * 100}%` : 0 }} />
            </span>
            <span className="month-label" aria-hidden="true">{m.label.slice(0, 3)}{i === 0 || m.label.startsWith('jan') ? <><br />{m.label.slice(-4)}</> : null}</span>
          </div>
        ))}
      </div>
    </figure>
  )
}
