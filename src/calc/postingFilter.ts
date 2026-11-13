// Filters for the Posteringer table on the Kontoplan page. All filters combine (AND); an empty
// value doesn't filter.

import { hitLabel, type ClassifiedPosting, type PostingStatus, type RuleHit } from './ledger'

export type PostingFilter = {
  /** Words that must all appear in the account, account name, supplier or text (any case) */
  search: string
  status: PostingStatus | ''
  account: string
  /** A Scope 3 category number, 'none' for postings without one, or '' */
  category: string
  /** A rule key (see hitKey), or '' */
  rule: string
  currency: string
  /** ISO dates, inclusive. A posting without a date is left out when either is set. */
  from: string
  to: string
}

export const emptyPostingFilter: PostingFilter = { search: '', status: '', account: '', category: '', rule: '', currency: '', from: '', to: '' }

export const isFiltered = (f: PostingFilter) => Object.values(f).some((v) => v.trim() !== '')

/** One key per rule. All account rules share one key: the account filter tells them apart. */
export function hitKey(hit: RuleHit): string {
  switch (hit.kind) {
    case 'exception': return `exception:${hit.rule.id}`
    case 'posting': return `posting:${hit.rule.id}`
    default: return hit.kind
  }
}

export function filterPostings(classified: readonly ClassifiedPosting[], f: PostingFilter): ClassifiedPosting[] {
  const words = f.search.toLowerCase().split(/\s+/).filter(Boolean)
  return classified.filter((c) => {
    const p = c.posting
    if (f.status && c.status !== f.status) return false
    if (f.account && p.account !== f.account) return false
    if (f.category && (f.category === 'none' ? c.category !== null : String(c.category) !== f.category)) return false
    if (f.rule && hitKey(c.hit) !== f.rule) return false
    if (f.currency && p.currency !== f.currency) return false
    if ((f.from || f.to) && !p.date) return false
    if (f.from && p.date < f.from) return false
    if (f.to && p.date > f.to) return false
    if (words.length) {
      const text = `${p.account} ${p.accountName} ${p.supplier} ${p.text}`.toLowerCase()
      if (!words.every((w) => text.includes(w))) return false
    }
    return true
  })
}

export type FilterOption = { value: string; label: string; count: number }

const values = (m: Map<string, FilterOption>) => [...m.values()]

/** The choices for each dropdown, from the postings themselves, with how many each has. */
export function filterOptions(classified: readonly ClassifiedPosting[]): { accounts: FilterOption[]; categories: FilterOption[]; rules: FilterOption[]; currencies: FilterOption[] } {
  const accounts = new Map<string, FilterOption>()
  const categories = new Map<string, FilterOption>()
  const rules = new Map<string, FilterOption>()
  const currencies = new Map<string, FilterOption>()
  const add = (m: Map<string, FilterOption>, value: string, label: string) => {
    const o = m.get(value)
    if (o) o.count++
    else m.set(value, { value, label, count: 1 })
  }
  for (const c of classified) {
    const p = c.posting
    add(accounts, p.account, p.accountName ? `${p.account} ${p.accountName}` : p.account)
    add(categories, c.category === null ? 'none' : String(c.category), c.category === null ? 'Ingen kategori' : `Kategori ${c.category}`)
    add(rules, hitKey(c.hit), c.hit.kind === 'account' ? 'Kontoregler' : hitLabel(c.hit))
    add(currencies, p.currency, p.currency)
  }
  const rulesOrder = (o: FilterOption) => ['manual', 'exception', 'posting', 'account', 'none'].indexOf(o.value.split(':')[0])
  return {
    accounts: values(accounts).sort((a, b) => a.value.localeCompare(b.value, 'da', { numeric: true })),
    categories: values(categories).sort((a, b) => (a.value === 'none' ? 1 : b.value === 'none' ? -1 : Number(a.value) - Number(b.value))),
    rules: values(rules).sort((a, b) => rulesOrder(a) - rulesOrder(b) || a.label.localeCompare(b.label, 'da', { numeric: true })),
    currencies: values(currencies).sort((a, b) => (a.value === 'DKK' ? -1 : b.value === 'DKK' ? 1 : a.value.localeCompare(b.value))),
  }
}
