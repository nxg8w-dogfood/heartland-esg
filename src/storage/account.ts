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
import { category1Groups, category4Groups, category4SpendGroups, category5Groups, category6Groups, defaultCategory3Params, type Category3Params } from '../calc/scope3'
import { noDeflation, type Deflation, type SpendLine } from '../calc/spend'
import { factors } from '../data/factors'
import { factorPublications } from '../data/factorPublications'
import type { FactorSourceChoice, FactorSources } from '../calc/factorSources'
import { emptyLedger, type LedgerState } from '../ledger/state'
import { defaultLocation } from '../scope2/defaultLocation'
import { defaultRelevance, type Relevance } from '../scope3/relevance'

/** 2: values entered for blank factors became per-factor source choices (factorSources). */
export const ACCOUNT_VERSION = 2

export type AccountData = {
  version: typeof ACCOUNT_VERSION
  period: Period
  scope1Lines: Scope1Line[]
  locations: Location[]
  scope2Lines: Scope2Line[]
  /** Where each factor's value comes from, by factor id; missing means the built-in table */
  factorSources: FactorSources
  relevance: Relevance
  category3Params: Category3Params
  cat1Lines: SpendLine[]
  /** Category 4: freight in tonne-km */
  cat4Lines: ActivityLine[]
  /** Category 4: courier and parcels, by spend */
  cat4SpendLines: SpendLine[]
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
    factorSources: {},
    relevance: defaultRelevance(),
    category3Params: defaultCategory3Params(factors),
    cat1Lines: [],
    cat4Lines: [],
    cat4SpendLines: [],
    cat5Lines: [],
    cat6Lines: [],
    surveys: [],
    investments: [],
    deflation: noDeflation,
    ledger: emptyLedger,
  }
}

export type LoadResult =
  | { ok: true; account: AccountData; dropped: number; notes: string[] }
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
  if (input.version !== 1 && input.version !== ACCOUNT_VERSION) {
    return { ok: false, error: `Ukendt version (${String(input.version)}). Filen er fra en anden version af appen.` }
  }
  const notes: string[] = []
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

  const factorSources: FactorSources = {}
  if (input.version === 1 && isObject(input.enteredFactors)) {
    // Version 1 stored values entered for blank factors. They become manual choices.
    for (const [id, v] of Object.entries(input.enteredFactors)) {
      if (typeof v !== 'number' || !Number.isFinite(v) || !factors.some((f) => f.id === id && f.value === null)) { dropped++; continue }
      factorSources[id] = { kind: 'manual', value: v, source: 'Indtastet (fra en tidligere version)', date: '' }
    }
    if ('f-s2-el-residual' in factorSources) {
      notes.push('Den tidligere indtastede residualmiks gælder nu kun linjer til og med 2024; 2025 og 2026 har hver deres faktor under Faktorer.')
    }
  } else if (isObject(input.factorSources)) {
    for (const [id, c] of Object.entries(input.factorSources)) {
      if (validChoice(id, c)) factorSources[id] = c
      else dropped++
    }
  }

  const account: AccountData = {
    version: ACCOUNT_VERSION,
    period,
    scope1Lines: list(input.scope1Lines, groupIn(scope1Groups)),
    locations,
    scope2Lines: list(input.scope2Lines, (l) => typeof l.locationId === 'string' && locationIds.has(l.locationId)),
    factorSources,
    relevance: isObject(input.relevance) ? { ...base.relevance, ...(input.relevance as Relevance) } : base.relevance,
    category3Params: isObject(input.category3Params) && typeof input.category3Params.gridLoss === 'number' && typeof input.category3Params.wttRatio === 'number'
      ? { gridLoss: input.category3Params.gridLoss, wttRatio: input.category3Params.wttRatio }
      : base.category3Params,
    cat1Lines: list(input.cat1Lines, groupIn(category1Groups)),
    cat4Lines: list(input.cat4Lines, groupIn(category4Groups)),
    cat4SpendLines: list(input.cat4SpendLines, groupIn(category4SpendGroups)),
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
  return { ok: true, account, dropped, notes }
}

/** A stored choice is used only if it still makes sense for a factor that still exists. */
function validChoice(id: string, c: unknown): c is FactorSourceChoice {
  if (!isObject(c) || !factors.some((f) => f.id === id)) return false
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  switch (c.kind) {
    case 'builtin': return true
    case 'publication': return factorPublications.some((p) => p.id === c.publicationId && id in p.values)
    case 'manual': return finite(c.value) && typeof c.source === 'string'
    case 'api': return finite(c.value) && typeof c.providerId === 'string' && typeof c.fetchedAt === 'string'
    default: return false
  }
}
