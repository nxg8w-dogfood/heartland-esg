// Filters for the rule tables on Kontoplan: the user's exceptions, the ESG owner's posting rules
// and account rules. All filters combine (AND); an empty value doesn't filter.

import { matchesQuery } from './factorSearch'
import type { EffectivePostingRule, Rule } from './ledger'
import type { AccountRule } from './spendRules'

export type RuleFilter = {
  /** Words that must all appear in the rule's text: name, conditions, search word, reason, factor */
  search: string
  /** 'include' or 'exclude' */
  handling: string
  /** A Scope 3 category number */
  category: string
  /** Exceptions: 'active' or 'inactive'. Posting rules: 'changed' or 'approved'. */
  state: string
}

export const emptyRuleFilter: RuleFilter = { search: '', handling: '', category: '', state: '' }

export const isRuleFiltered = (f: RuleFilter) => Object.values(f).some((v) => v.trim() !== '')

/** The user's exceptions that pass. `factorName` gives the name searched for a rule's factor. */
export function filterExceptions(rules: readonly Rule[], f: RuleFilter, factorName: (id: string | null) => string): Rule[] {
  return rules.filter((r) =>
    matchesQuery([r.name, r.reason, factorName(r.factorId), ...r.conditions.map((c) => c.value)].join(' '), f.search) &&
    (!f.handling || (f.handling === 'include') === (r.type === 'tag')) &&
    (!f.category || (r.type === 'tag' && String(r.category) === f.category)) &&
    (!f.state || (f.state === 'active') === r.active))
}

/** The posting rules that pass; the category is the one a rule applies to or moves postings to. */
export function filterPostingRules<R extends EffectivePostingRule>(rules: readonly R[], f: RuleFilter, factorName: (rule: R) => string): R[] {
  return rules.filter((r) =>
    matchesQuery([r.id, r.searchWord, r.reason, factorName(r)].join(' '), f.search) &&
    (!f.handling || r.handling === f.handling) &&
    (!f.category || String(r.appliesTo) === f.category || String(r.moveTo) === f.category) &&
    (!f.state || (f.state === 'changed') === !!r.edit))
}

/** The account rules that pass. */
export function filterAccountRules(rules: readonly AccountRule[], f: RuleFilter): AccountRule[] {
  return rules.filter((r) =>
    matchesQuery([r.account, r.name, r.reason, r.factorCode ?? '', r.basis].join(' '), f.search) &&
    (!f.handling || (f.handling === 'include') === r.include) &&
    (!f.category || String(r.category) === f.category))
}
