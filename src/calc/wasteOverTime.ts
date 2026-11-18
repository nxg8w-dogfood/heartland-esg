// Category 5 month by month, per waste area, for the waste page's charts. A line is spread over
// the days it covers, as for the period, so the months add up to the period's figures.

import type { Factor } from '../data/factors'
import type { ActivityLine } from './activity'
import { periodMonths } from './companyOverview'
import type { Period } from './dates'
import { category5 } from './scope3'

/** What the waste is split by: the row type, its fraction (before "–") or its treatment (after) */
export type WasteSplit = 'type' | 'fraction' | 'treatment'

export type WasteMonth = { label: string; start: string; tonnes: number; t: number }

export type WasteSeries = {
  key: string
  label: string
  months: WasteMonth[]
  tonnes: number
  /** tCO2e */
  t: number
}

export type WasteOverTime = { total: WasteSeries; series: WasteSeries[] }

/** "Pap/papir – genanvendelse" → its fraction "Pap/papir" or its treatment "Genanvendelse" */
export function wasteArea(groupLabel: string, split: WasteSplit): string {
  if (split === 'type') return groupLabel
  const [fraction, treatment = ''] = groupLabel.split(/\s+[–-]\s+/)
  if (split === 'fraction') return fraction
  return treatment ? treatment[0].toUpperCase() + treatment.slice(1) : 'Uden behandling'
}

export function wasteOverTime(lines: readonly ActivityLine[], factors: readonly Factor[], period: Period, split: WasteSplit): WasteOverTime {
  const months = periodMonths(period)
  const empty = (key: string, label: string): WasteSeries => ({
    key, label, tonnes: 0, t: 0, months: months.map((m) => ({ label: m.label, start: m.start, tonnes: 0, t: 0 })),
  })
  const total = empty('', 'Alt affald')
  const byArea = new Map<string, WasteSeries>()
  months.forEach((m, i) => {
    for (const r of category5(lines, factors, m).lines) {
      const label = wasteArea(r.group.label, split)
      const s = byArea.get(label) ?? empty(label, label)
      byArea.set(label, s)
      const tonnes = r.quantityInPeriod ?? 0
      for (const target of [s, total]) {
        target.months[i].tonnes += tonnes
        target.months[i].t += r.tCO2e
        target.tonnes += tonnes
        target.t += r.tCO2e
      }
    }
  })
  const series = [...byArea.values()].filter((s) => s.tonnes || s.t).sort((a, b) => b.tonnes - a.tonnes || a.label.localeCompare(b.label, 'da'))
  return { total, series }
}
