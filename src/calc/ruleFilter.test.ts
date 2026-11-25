import { describe, expect, it } from 'vitest'
import { accountRules, postingRules } from '../data/scope3Rules'
import type { EffectivePostingRule, Rule } from './ledger'
import { emptyRuleFilter, filterAccountRules, filterExceptions, filterPostingRules, isRuleFiltered, type RuleFilter } from './ruleFilter'

const rule = (o: Partial<Rule>): Rule => ({ id: 'r', name: 'Regel', type: 'tag', active: true, conditions: [], factorId: null, category: 1, reason: '', ...o })
const kantine = rule({ id: 'k', name: 'Kantine', type: 'exclude', conditions: [{ id: 'c', field: 'supplier', operator: 'contains', value: 'Kantinen ApS' }], reason: 'Intern' })
const revision = rule({ id: 'r', name: 'Revision', factorId: 'f-obs', category: 1, conditions: [{ id: 'c', field: 'account', operator: 'is', value: '6100' }] })
const tog = rule({ id: 't', name: 'Tog', factorId: 'f-rail', category: 6, active: false })
const f = (o: Partial<RuleFilter>) => ({ ...emptyRuleFilter, ...o })
const names = (id: string | null) => ({ 'f-obs': 'Other business services', 'f-rail': 'Railway transport' })[id ?? ''] ?? ''
const ex = (o: Partial<RuleFilter>) => filterExceptions([kantine, revision, tog], f(o), names).map((r) => r.id)

describe('filterExceptions', () => {
  it('passes everything without filters', () => {
    expect(isRuleFiltered(emptyRuleFilter)).toBe(false)
    expect(ex({})).toEqual(['k', 'r', 't'])
  })

  it('searches name, condition values, reason and factor, ignoring case and accents', () => {
    expect(ex({ search: 'kantinen aps' })).toEqual(['k'])
    expect(ex({ search: '6100' })).toEqual(['r'])
    expect(ex({ search: 'railway' })).toEqual(['t'])
    expect(ex({ search: 'intern kantine' })).toEqual(['k'])
  })

  it('filters by handling, category and status', () => {
    expect(ex({ handling: 'exclude' })).toEqual(['k'])
    expect(ex({ handling: 'include' })).toEqual(['r', 't'])
    expect(ex({ category: '6' })).toEqual(['t'])
    expect(ex({ state: 'inactive' })).toEqual(['t'])
    expect(ex({ state: 'active', handling: 'include' })).toEqual(['r'])
  })
})

describe('filterPostingRules', () => {
  const rules = postingRules as readonly EffectivePostingRule[]
  const pr = (o: Partial<RuleFilter>, list = rules) => filterPostingRules(list, f(o), (r) => r.factorCode ?? '').map((r) => r.id)

  it('searches id, search word, reason and factor', () => {
    expect(pr({ search: 'R10' })).toEqual(['R10'])
    expect(pr({ search: 'molslinjen' })).toEqual(['R07'])
    expect(pr({ search: 'EXIO-SEA' })).toEqual(['R07', 'R08', 'R09'])
  })

  it('filters by the category a rule applies to or moves postings to', () => {
    expect(pr({ category: '1' })).toContain('R23')
    expect(pr({ category: '2' })).toContain('R27')
    expect(pr({ category: '2' })).not.toContain('R10')
  })

  it('filters changed rules from approved ones', () => {
    const edited = rules.map((r) => (r.id === 'R33' ? { ...r, edit: { id: 'e', ruleId: 'R33', handling: 'include' as const, factorId: null, moveTo: null, reason: '', editedOn: '' } } : r))
    expect(pr({ state: 'changed' }, edited)).toEqual(['R33'])
    expect(pr({ state: 'approved' }, edited)).toHaveLength(rules.length - 1)
  })
})

describe('filterAccountRules', () => {
  it('filters by included and category, and searches account and name', () => {
    const shown = filterAccountRules(accountRules, f({ handling: 'exclude' }))
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.every((r) => !r.include)).toBe(true)
    expect(filterAccountRules(accountRules, f({ search: '101101' })).map((r) => r.name)).toEqual(['Vedligeholdelse, bygninger'])
    expect(filterAccountRules(accountRules, f({ category: '6' })).every((r) => r.category === 6)).toBe(true)
  })
})
