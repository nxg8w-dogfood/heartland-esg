// The group: several companies, each with its own climate account and factor sources, and the
// group's ownership share in each by year. The group total consolidates by equity share
// (docs/adr/0006). This is what the store saves and a backup file contains.

import type { Period } from '../calc/dates'
import { newId } from '../newId'
import { emptyAccount, parseAccount, type AccountData } from './account'

/** 3: the account became one company in a group. Versions 1 and 2 load as a single company. */
export const GROUP_VERSION = 3

/** The group's ownership share, in percent, from a year until the next entry */
export type OwnershipShare = { fromYear: number; pct: number }

export type Company = {
  id: string
  name: string
  ownership: OwnershipShare[]
  account: AccountData
}

export type GroupData = {
  version: typeof GROUP_VERSION
  name: string
  companies: Company[]
  /** The company the Scope, Kontoplan and Faktorer pages show */
  activeCompanyId: string
  /** The period the Koncern page sums up */
  summaryPeriod: Period
}

export function newCompany(name: string, account: AccountData = emptyAccount()): Company {
  return { id: newId(), name, ownership: [{ fromYear: 2000, pct: 100 }], account }
}

export function emptyGroup(): GroupData {
  const first = newCompany('Virksomhed 1')
  return { version: GROUP_VERSION, name: 'Koncernen', companies: [first], activeCompanyId: first.id, summaryPeriod: first.account.period }
}

/** The ownership share in percent for a year, or null when no entry covers it. */
export function ownershipFor(company: Company, year: number): number | null {
  const entry = [...company.ownership].sort((a, b) => b.fromYear - a.fromYear).find((o) => o.fromYear <= year)
  return entry ? entry.pct : null
}

export type GroupLoadResult =
  | { ok: true; group: GroupData; dropped: number; notes: string[] }
  | { ok: false; error: string }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isIsoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const validShare = (v: unknown): v is OwnershipShare =>
  isObject(v) && Number.isInteger(v.fromYear) && typeof v.pct === 'number' && Number.isFinite(v.pct) && v.pct >= 0 && v.pct <= 100

/** Parses saved or imported data: a group, or a single account from an earlier version. */
export function parseGroup(input: unknown): GroupLoadResult {
  if (!isObject(input)) return { ok: false, error: 'Filen indeholder ikke et klimaregnskab.' }

  if (input.version === 1 || input.version === 2) {
    const r = parseAccount(input)
    if (!r.ok) return r
    const company = newCompany('Virksomhed 1', r.account)
    return {
      ok: true,
      group: { version: GROUP_VERSION, name: 'Koncernen', companies: [company], activeCompanyId: company.id, summaryPeriod: r.account.period },
      dropped: r.dropped,
      notes: [...r.notes, 'Klimaregnskabet er nu den første virksomhed i en koncern. Giv den et navn under Koncern.'],
    }
  }
  if (input.version !== GROUP_VERSION) {
    return { ok: false, error: `Ukendt version (${String(input.version)}). Filen er fra en anden version af appen.` }
  }
  if (!Array.isArray(input.companies)) return { ok: false, error: 'Filen indeholder ingen virksomheder.' }

  let dropped = 0
  const notes: string[] = []
  const companies: Company[] = []
  for (const c of input.companies) {
    if (!isObject(c) || typeof c.id !== 'string' || !c.id || typeof c.name !== 'string') { dropped++; continue }
    const r = parseAccount(c.account)
    if (!r.ok) { dropped++; continue }
    dropped += r.dropped
    notes.push(...r.notes.map((n) => `${c.name}: ${n}`))
    const ownership = Array.isArray(c.ownership) ? c.ownership.filter(validShare) : []
    if (Array.isArray(c.ownership)) dropped += c.ownership.length - ownership.length
    companies.push({ id: c.id, name: c.name, ownership, account: r.account })
  }
  if (companies.length === 0) return { ok: false, error: 'Filen indeholder ingen virksomheder, appen kan bruge.' }

  const activeCompanyId = companies.some((c) => c.id === input.activeCompanyId) ? (input.activeCompanyId as string) : companies[0].id
  const p = input.summaryPeriod
  const summaryPeriod = isObject(p) && isIsoDate(p.start) && isIsoDate(p.end) ? { start: p.start, end: p.end } : companies[0].account.period
  return {
    ok: true,
    group: { version: GROUP_VERSION, name: typeof input.name === 'string' ? input.name : 'Koncernen', companies, activeCompanyId, summaryPeriod },
    dropped,
    notes,
  }
}
