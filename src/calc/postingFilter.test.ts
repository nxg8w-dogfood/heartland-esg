import { describe, expect, it } from 'vitest'
import type { ClassifiedPosting, Posting, RuleHit } from './ledger'
import { emptyPostingFilter, filterOptions, filterPostings, hitKey, isFiltered, type PostingFilter } from './postingFilter'
import type { AccountRule, PostingRule } from './spendRules'

const accountRule: AccountRule = { account: '240003', name: 'Transport', include: true, category: 6, factorCode: 'EXIO-LAND', basis: 'Datamanual', reason: '' }
const dsb: PostingRule = { id: 'R10', priority: 10, searchWord: 'DSB ', appliesTo: 6, handling: 'include', factorCode: 'EXIO-RAIL', moveTo: null, reason: '', approvedOn: '2026-10-27' }

let n = 0
function row(p: Partial<Posting>, c: Partial<Omit<ClassifiedPosting, 'posting'>> = {}): ClassifiedPosting {
  n++
  return {
    posting: { id: `p${n}`, importId: 'i', date: '2026-07-07', account: '980001', accountName: 'Treasury - clearing', supplier: '', text: '', amount: 1, currency: 'DKK', ...p },
    status: 'excluded', hit: { kind: 'account', rule: { ...accountRule, account: p.account ?? '980001', include: false } }, factorId: null, category: null, reason: '', ...c,
  }
}

const fx = row({ text: 'FX nr. 6506 DKK/GBP 5.600.000', currency: 'GBP' })
const train = row({ date: '2026-03-02', account: '240003', accountName: 'Transport', supplier: 'DSB Netbutik', text: 'Billet København–Aarhus' }, { status: 'included', hit: { kind: 'posting', rule: dsb }, category: 6, factorId: 'f-exio-rail' })
const taxi = row({ date: '2026-03-31', account: '240003', accountName: 'Transport', supplier: 'Taxa 4x35', text: 'Kørsel' }, { status: 'included', hit: { kind: 'account', rule: accountRule }, category: 6 })
const manual = row({ date: '', account: '210013', accountName: 'Konsulent', supplier: 'Deloitte', text: 'Rådgivning' }, { status: 'review', hit: { kind: 'manual' }, category: 1 })
const all = [fx, train, taxi, manual]
const ids = (f: Partial<PostingFilter>) => filterPostings(all, { ...emptyPostingFilter, ...f }).map((c) => c.posting.id)

describe('filterPostings', () => {
  it('shows everything without a filter', () => {
    expect(ids({})).toEqual(all.map((c) => c.posting.id))
    expect(isFiltered(emptyPostingFilter)).toBe(false)
    expect(isFiltered({ ...emptyPostingFilter, search: '  ' })).toBe(false)
    expect(isFiltered({ ...emptyPostingFilter, account: '980001' })).toBe(true)
  })

  it('searches account, account name, supplier and text, ignoring case, all words required', () => {
    expect(ids({ search: 'dsb' })).toEqual([train.posting.id])
    expect(ids({ search: 'treasury' })).toEqual([fx.posting.id])
    expect(ids({ search: '210013' })).toEqual([manual.posting.id])
    expect(ids({ search: 'transport kørsel' })).toEqual([taxi.posting.id])
    expect(ids({ search: 'transport fly' })).toEqual([])
  })

  it('filters by status, account, category, rule and currency', () => {
    expect(ids({ status: 'included' })).toEqual([train.posting.id, taxi.posting.id])
    expect(ids({ account: '240003' })).toEqual([train.posting.id, taxi.posting.id])
    expect(ids({ category: '6' })).toEqual([train.posting.id, taxi.posting.id])
    expect(ids({ category: 'none' })).toEqual([fx.posting.id])
    expect(ids({ rule: 'posting:R10' })).toEqual([train.posting.id])
    expect(ids({ rule: 'account' })).toEqual([fx.posting.id, taxi.posting.id])
    expect(ids({ rule: 'manual' })).toEqual([manual.posting.id])
    expect(ids({ currency: 'GBP' })).toEqual([fx.posting.id])
  })

  it('filters by an inclusive date range and leaves out postings without a date', () => {
    expect(ids({ from: '2026-03-02', to: '2026-03-31' })).toEqual([train.posting.id, taxi.posting.id])
    expect(ids({ from: '2026-04-01' })).toEqual([fx.posting.id])
    expect(ids({ to: '2026-03-02' })).toEqual([train.posting.id])
  })

  it('combines filters', () => {
    expect(ids({ account: '240003', rule: 'account' })).toEqual([taxi.posting.id])
    expect(ids({ status: 'excluded', search: 'dsb' })).toEqual([])
  })
})

describe('hitKey', () => {
  it('has one key per rule and one for all account rules', () => {
    const exception: RuleHit = { kind: 'exception', rule: { id: 'r1', name: 'Revision', type: 'tag', active: true, conditions: [], factorId: null, category: 1, reason: '' } }
    expect(hitKey(exception)).toBe('exception:r1')
    expect(hitKey(train.hit)).toBe('posting:R10')
    expect(hitKey(taxi.hit)).toBe('account')
    expect(hitKey({ kind: 'none' })).toBe('none')
  })
})

describe('filterOptions', () => {
  it('lists the values in the postings with counts, in a useful order', () => {
    const o = filterOptions(all)
    expect(o.accounts).toEqual([
      { value: '210013', label: '210013 Konsulent', count: 1 },
      { value: '240003', label: '240003 Transport', count: 2 },
      { value: '980001', label: '980001 Treasury - clearing', count: 1 },
    ])
    expect(o.categories.map((c) => [c.label, c.count])).toEqual([['Kategori 1', 1], ['Kategori 6', 2], ['Ingen kategori', 1]])
    expect(o.rules.map((r) => [r.value, r.label, r.count])).toEqual([
      ['manual', 'Manuel handling', 1],
      ['posting:R10', 'R10 «DSB »', 1],
      ['account', 'Kontoregler', 2],
    ])
    expect(o.currencies.map((c) => c.value)).toEqual(['DKK', 'GBP'])
  })
})
