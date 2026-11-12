// The ESG owner's rules for spend-based tagging (docs/adr/0015): account rules give each ledger
// account its default Scope 3 category and EXIOBASE factor, and posting rules refine single
// postings by a search word. Both are kept in code as seed data (src/data/scope3Rules.ts), so a
// change to an approved rule goes through a pull request. Users add their own exceptions on top
// (the ledger's Rule list, see ledger.ts), and those win.

/** Line's "Grundlag": from the data manual, an estimate to confirm, or still to be clarified. */
export type RuleBasis = 'Datamanual' | 'Skøn – bekræft' | 'Afklar' | ''

/** One row of kontoregler.csv. */
export type AccountRule = {
  account: string
  name: string
  /** Medtages: does the account count in the climate account at all */
  include: boolean
  /** Scope 3 category number, e.g. 1 for "Scope 3.1"; null when none is given */
  category: number | null
  /** FaktorID, e.g. EXIO-OBS; resolved through the factor register */
  factorCode: string | null
  basis: RuleBasis
  reason: string
}

/** Handling: exclude, include, include but flag for review, or wait for a decision. */
export type PostingHandling = 'exclude' | 'include' | 'review' | 'pending'

/** One row of posteringsregler.csv. */
export type PostingRule = {
  /** RegelID, e.g. R10 */
  id: string
  /** Lowest first; the first rule that matches wins */
  priority: number
  /** Matched case-sensitively and exactly as written, spaces included ("DSB ") */
  searchWord: string
  /** GaelderForKategori: only postings whose account rule puts them in this category; null for all */
  appliesTo: number | null
  handling: PostingHandling
  /** Overrides the account's factor; null keeps it */
  factorCode: string | null
  /** FlytTilKategori: moves the posting to another category; null keeps it */
  moveTo: number | null
  reason: string
  /** Approval date (ISO) from the stamp */
  approvedOn: string
}

/** What a posting rule's search word is looked for in. */
type Searchable = { text: string; supplier: string }

export function postingRuleMatches(rule: PostingRule, posting: Searchable, accountCategory: number | null): boolean {
  if (!rule.searchWord) return false
  if (rule.appliesTo !== null && rule.appliesTo !== accountCategory) return false
  return posting.text.includes(rule.searchWord) || posting.supplier.includes(rule.searchWord)
}

/** The first posting rule, by priority, that matches. Expects the rules sorted by priority. */
export function firstPostingRule(rules: readonly PostingRule[], posting: Searchable, accountCategory: number | null): PostingRule | null {
  return rules.find((r) => postingRuleMatches(r, posting, accountCategory)) ?? null
}

/** "Scope 3.6" → 6; anything else → null. */
export function parseScope3Category(value: string): number | null {
  const m = value.trim().match(/^Scope 3\.(\d{1,2})$/)
  const n = m ? Number(m[1]) : NaN
  return n >= 1 && n <= 15 ? n : null
}

export const handlingLabels: Record<PostingHandling, string> = {
  exclude: 'Udelad',
  include: 'Medtag',
  review: 'Medtag – review',
  pending: 'Afventer',
}
