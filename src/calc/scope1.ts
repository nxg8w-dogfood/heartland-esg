// Scope 1: direct emissions from sources the company owns or controls.
// The groups and their factors are the original app's, one for one.

import type { Factor } from '../data/factors'
import { activityLine, type ActivityResult } from './activity'
import type { Period } from './dates'

export const scope1Groups = [
  { id: 's1-diesel', label: 'Firmabiler – diesel', unit: 'liter', factorId: 'f-s1-diesel', kind: 'mobile' },
  { id: 's1-benzin', label: 'Firmabiler – benzin', unit: 'liter', factorId: 'f-s1-benzin', kind: 'mobile' },
  { id: 's1-naturgas', label: 'Opvarmning – naturgas', unit: 'm³', factorId: 'f-s1-naturgas', kind: 'stationary' },
  { id: 's1-gasolie', label: 'Opvarmning – fyringsgasolie', unit: 'liter', factorId: 'f-s1-gasolie', kind: 'stationary' },
  { id: 's1-hfc134a', label: 'Kølemiddel HFC-134a', unit: 'kg', factorId: 'f-s1-hfc134a', kind: 'fugitive' },
  { id: 's1-koel-andet', label: 'Andet kølemiddel', unit: 'kg', factorId: 'f-s1-koel-andet', kind: 'fugitive' },
] as const

export type Scope1Group = (typeof scope1Groups)[number]
export type Scope1GroupId = Scope1Group['id']

export type Scope1Line = {
  id: string
  group: Scope1GroupId
  date: string
  dateTo?: string | null
  /** In the group's unit */
  quantity: number | null
  /** kg CO2e per unit, overriding the table factor */
  customFactor?: number | null
  description?: string
}

export type Scope1LineResult = ActivityResult<Scope1Group, Scope1Line>

export type Scope1Summary = {
  lines: Scope1LineResult[]
  total: number
  mobile: number
  stationary: number
  fugitive: number
  pendingCount: number
}

export function scope1Line(
  line: Scope1Line,
  factors: readonly Factor[],
  period: Period,
): Scope1LineResult {
  const group = scope1Groups.find((g) => g.id === line.group)
  if (!group) throw new Error(`Unknown Scope 1 group: ${line.group}`)
  return activityLine(line, group, factors, period)
}

/** Lines outside the period are left out of the summary, but not deleted. */
export function scope1Summary(
  lines: readonly Scope1Line[],
  factors: readonly Factor[],
  period: Period,
): Scope1Summary {
  const results = lines
    .map((line) => scope1Line(line, factors, period))
    .filter((r) => r.share > 0)
  const sum = (kind?: Scope1Group['kind']) =>
    results.filter((r) => !kind || r.group.kind === kind).reduce((t, r) => t + r.tCO2e, 0)
  return {
    lines: results,
    total: sum(),
    mobile: sum('mobile'),
    stationary: sum('stationary'),
    fugitive: sum('fugitive'),
    pendingCount: results.filter((r) => r.pending).length,
  }
}
