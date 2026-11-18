import { useId, useMemo, useState } from 'react'
import type { ActivityLine } from '../calc/activity'
import type { Period } from '../calc/dates'
import { wasteOverTime, type WasteSeries, type WasteSplit } from '../calc/wasteOverTime'
import { MonthChart } from '../charts/MonthChart'
import type { Factor } from '../data/factors'
import { formatNumber } from '../format'

type Measure = 'tonnes' | 'tCO2e'

const splits: { id: WasteSplit; label: string }[] = [
  { id: 'type', label: 'Fraktion og behandling' },
  { id: 'fraction', label: 'Fraktion' },
  { id: 'treatment', label: 'Behandling' },
]

/** Category 5 over time: all waste, then one small chart per area, each on its own scale. */
export function WasteCharts({ lines, factors, period }: { lines: readonly ActivityLine[]; factors: readonly Factor[]; period: Period }) {
  const id = useId()
  const [split, setSplit] = useState<WasteSplit>('fraction')
  const [measure, setMeasure] = useState<Measure>('tonnes')
  const data = useMemo(() => wasteOverTime(lines, factors, period, split), [lines, factors, period, split])
  if (data.total.tonnes === 0 && data.total.t === 0) return null

  const unit = measure === 'tonnes' ? 'tons' : 'tCO2e'
  const months = (s: WasteSeries) => s.months.map((m) => ({ label: m.label, start: m.start, value: measure === 'tonnes' ? m.tonnes : m.t }))
  const summary = (s: WasteSeries) => `${formatNumber(s.tonnes, 2)} tons · ${formatNumber(s.t, 3)} tCO2e i perioden`

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Affald over tid</h2>
      <div className="chart-controls">
        <div className="field">
          <label htmlFor={`${id}-split`}>Opdel efter</label>
          <select id={`${id}-split`} value={split} onChange={(e) => setSplit(e.target.value as WasteSplit)}>
            {splits.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <fieldset className="method-toggle">
          <legend>Vis</legend>
          {(['tonnes', 'tCO2e'] as const).map((m) => (
            <label key={m}>
              <input type="radio" name={`${id}-measure`} value={m} checked={measure === m} onChange={() => setMeasure(m)} />
              {m === 'tonnes' ? 'Mængde (tons)' : 'Udledning (tCO2e)'}
            </label>
          ))}
        </fieldset>
      </div>

      <MonthChart title="Alt affald" subtitle={summary(data.total)} unit={unit} months={months(data.total)} decimals={measure === 'tonnes' ? 2 : 3} />

      <p className="muted">Hver graf herunder har sin egen skala; sammenlign mængderne i teksten over graferne.</p>
      <div className="small-multiples">
        {data.series.map((s) => (
          <MonthChart key={s.key} compact title={s.label} subtitle={summary(s)} unit={unit} months={months(s)} decimals={measure === 'tonnes' ? 2 : 3} />
        ))}
      </div>
    </section>
  )
}
