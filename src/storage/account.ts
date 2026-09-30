// The whole climate account as one versioned, serialisable object: what the storage layer
// saves and loads, and what a backup file contains. Loading validates the structure and drops
// records the app couldn't use (an unknown line type, a record without an id), and reports how
// many, rather than failing or crashing later.

import type { ActivityLine } from '../calc/activity'
import type { Survey } from '../calc/commuting'
import type { Period } from '../calc/dates'
import type { Investment } from '../calc/investments'
import { scope1Groups, type Scope1Line } from '../calc/scope1'
import type { Location, Scope2Line } from '../calc/scope2'
import { category1Groups, category5Groups, category6Groups, defaultCategory3Params, type Category3Params } from '../calc/scope3'
import { noDeflation, type Deflation, type SpendLine } from '../calc/spend'
import { factors } from '../data/factors'
import { emptyLedger, type LedgerState } from '../ledger/state'
import { defaultLocation } from '../scope2/defaultLocation'
import { defaultRelevance, type Relevance } from '../scope3/relevance'

export const ACCOUNT_VERSION = 1

export type AccountData = {
  version: typeof ACCOUNT_VERSION
  period: Period
  scope1Lines: Scope1Line[]
  locations: Location[]
  scope2Lines: Scope2Line[]
  /** Values entered for factors that ship without one, by factor id */
  enteredFactors: Record<string, number>
  relevance: Relevance
  category3Params: Category3Params
  cat1Lines: SpendLine[]
  cat5Lines: ActivityLine[]
  cat6Lines: ActivityLine[]
  surveys: Survey[]
  investments: Investment[]
  deflation: Deflation
  ledger: LedgerState
}

export function emptyAccount(): AccountData {
  return {
    version: ACCOUNT_VERSION,
    period: { start: '2025-01-01', end: '2025-12-31' },
    scope1Lines: [],
    locations: [defaultLocation()],
    scope2Lines: [],
    enteredFactors: {},
    relevance: defaultRelevance(),
    category3Params: defaultCategory3Params(factors),
    cat1Lines: [],
    cat5Lines: [],
    cat6Lines: [],
    surveys: [],
    investments: [],
    deflation: noDeflation,
    ledger: emptyLedger,
  }
}

export type LoadResult =
  | { ok: true; account: AccountData; dropped: number }
  | { ok: false; error: string }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const hasId = (v: unknown): v is { id: string } => isObject(v) && typeof v.id === 'string' && v.id !== ''
const isIsoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/**
 * Parses saved or imported data. Missing sections get their defaults. Records without an id,
 * lines of an unknown type, and Scope 2 lines for a location that doesn't exist are dropped.
 */
export function parseAccount(input: unknown): LoadResult {
  if (!isObject(input)) return { ok: false, error: 'Filen indeholder ikke et klimaregnskab.' }
  if (input.version !== ACCOUNT_VERSION) {
    return { ok: false, error: `Ukendt version (${String(input.version)}). Filen er fra en anden version af appen.` }
  }
  const base = emptyAccount()
  let dropped = 0
  const list = <T,>(value: unknown, keep: (item: Record<string, unknown>) => boolean = () => true): T[] => {
    if (!Array.isArray(value)) return []
    const kept = value.filter((item) => hasId(item) && keep(item as Record<string, unknown>))
    dropped += value.length - kept.length
    return kept as T[]
  }
  const groupIn = (ids: readonly { id: string }[]) => {
    const known = new Set(ids.map((g) => g.id))
    return (item: Record<string, unknown>) => typeof item.group === 'string' && known.has(item.group)
  }

  const period = isObject(input.period) && isIsoDate(input.period.start) && isIsoDate(input.period.end)
    ? { start: input.period.start, end: input.period.end }
    : base.period
  const locations = Array.isArray(input.locations) ? list<Location>(input.locations) : base.locations
  const locationIds = new Set(locations.map((l) => l.id))
  const ledgerIn = isObject(input.ledger) ? input.ledger : {}
  const postings = list<LedgerState['postings'][number]>(ledgerIn.postings)
  const postingIds = new Set(postings.map((p) => p.id))
  const manual = isObject(ledgerIn.manual)
    ? Object.fromEntries(Object.entries(ledgerIn.manual).filter(([id, m]) => {
        const keep = postingIds.has(id) && isObject(m)
        if (!keep) dropped++
        return keep
      }))
    : {}

  const entered = isObject(input.enteredFactors)
    ? Object.fromEntries(Object.entries(input.enteredFactors).filter(([id, v]) => {
        const keep = typeof v === 'number' && Number.isFinite(v) && factors.some((f) => f.id === id && f.value === null)
        if (!keep) dropped++
        return keep
      })) as Record<string, number>
    : {}

  const account: AccountData = {
    version: ACCOUNT_VERSION,
    period,
    scope1Lines: list(input.scope1Lines, groupIn(scope1Groups)),
    locations,
    scope2Lines: list(input.scope2Lines, (l) => typeof l.locationId === 'string' && locationIds.has(l.locationId)),
    enteredFactors: entered,
    relevance: isObject(input.relevance) ? { ...base.relevance, ...(input.relevance as Relevance) } : base.relevance,
    category3Params: isObject(input.category3Params) && typeof input.category3Params.gridLoss === 'number' && typeof input.category3Params.wttRatio === 'number'
      ? { gridLoss: input.category3Params.gridLoss, wttRatio: input.category3Params.wttRatio }
      : base.category3Params,
    cat1Lines: list(input.cat1Lines, groupIn(category1Groups)),
    cat5Lines: list(input.cat5Lines, groupIn(category5Groups)),
    cat6Lines: list(input.cat6Lines, groupIn(category6Groups)),
    surveys: list(input.surveys, (s) => isObject(s.modes)),
    investments: list(input.investments),
    deflation: isObject(input.deflation) && Array.isArray(input.deflation.series)
      ? { ...noDeflation, ...(input.deflation as Partial<Deflation>) }
      : base.deflation,
    ledger: {
      postings,
      imports: list(ledgerIn.imports),
      rules: list(ledgerIn.rules, (r) => Array.isArray(r.conditions)),
      manual: manual as LedgerState['manual'],
    },
  }
  return { ok: true, account, dropped }
}
