import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import { accountRules, postingRules } from '../data/scope3Rules'
import { spendFactorRegister } from '../data/spendFactorRegister'
import { builtinRuleBook, classify, classifyLedger, counts, hitLabel, ledgerSpendLines, ledgerSummary, type ManualAction, type Posting, type Rule, type RuleBook } from './ledger'
import { parseScope3Category, postingRuleMatches, type AccountRule, type PostingRule } from './spendRules'

const posting = (o: Partial<Posting> = {}): Posting => ({
  id: 'p1', importId: 'i1', date: '2026-03-31', account: '240003', accountName: 'Transport', supplier: '', text: '',
  amount: 1000, currency: 'DKK', ...o,
})
const account = (o: Partial<AccountRule> = {}): AccountRule => ({
  account: '240003', name: 'Transport', include: true, category: 6, factorCode: 'EXIO-LAND', basis: 'Datamanual', reason: 'Bus/taxi', ...o,
})
const prule = (o: Partial<PostingRule> = {}): PostingRule => ({
  id: 'R10', priority: 10, searchWord: 'DSB ', appliesTo: 6, handling: 'include', factorCode: 'EXIO-RAIL', moveTo: null, reason: 'Tog', approvedOn: '2026-10-27', ...o,
})
const book = (accounts: AccountRule[], rules: PostingRule[] = []): RuleBook => ({
  accountRules: accounts, postingRules: rules, factorFor: builtinRuleBook.factorFor,
})
const none = new Map<string, ManualAction>()
const exception = (o: Partial<Rule> = {}): Rule => ({
  id: 'u1', name: 'Min undtagelse', type: 'exclude', active: true, conditions: [{ id: 'c', field: 'text', operator: 'contains', value: 'DSB' }],
  factorId: null, category: 6, reason: 'Intern', ...o,
})

describe('account rules', () => {
  it('give an included account its category and factor', () => {
    expect(classify(posting(), [], none, book([account()]))).toMatchObject({ status: 'included', category: 6, factorId: 'f-exio-land', hit: { kind: 'account' } })
  })

  it('count a confirmed estimate as included', () => {
    expect(classify(posting(), [], none, book([account({ basis: 'Bekræftet' })])).status).toBe('included')
  })

  it('flag an estimate to confirm for review, and still count it', () => {
    const c = classify(posting(), [], none, book([account({ basis: 'Skøn – bekræft' })]))
    expect(c.status).toBe('review')
    expect(counts(c)).toBe(true)
  })

  it('exclude an account that is not included, keeping its category for display', () => {
    const c = classify(posting(), [], none, book([account({ include: false, factorCode: null })]))
    expect(c).toMatchObject({ status: 'excluded', category: 6, factorId: null })
    expect(counts(c)).toBe(false)
  })

  it('leave an account with no rule untagged', () => {
    expect(classify(posting({ account: '999999' }), [], none, book([account()])).status).toBe('untagged')
  })

  it('match the account number with surrounding spaces trimmed', () => {
    expect(classify(posting({ account: ' 240003 ' }), [], none, book([account()])).status).toBe('included')
  })
})

describe('posting rules', () => {
  it('override the factor of a matching posting', () => {
    const c = classify(posting({ text: 'DSB App rejse' }), [], none, book([account()], [prule()]))
    expect(c).toMatchObject({ status: 'included', factorId: 'f-exio-rail', category: 6, hit: { kind: 'posting', rule: { id: 'R10' } } })
  })

  it('match case-sensitively and with the search word exactly as written', () => {
    const b = book([account()], [prule()])
    expect(classify(posting({ text: 'Skodsborg station' }), [], none, b).hit.kind).toBe('account')
    expect(classify(posting({ text: 'dsb app' }), [], none, b).hit.kind).toBe('account')
    expect(classify(posting({ text: 'DSB' }), [], none, b).hit.kind).toBe('account')
    expect(classify(posting({ text: 'Billet DSB 1234' }), [], none, b).hit.kind).toBe('posting')
  })

  it('look in the supplier as well as the text', () => {
    expect(classify(posting({ supplier: 'DSB Netbutik' }), [], none, book([account()], [prule()])).hit.kind).toBe('posting')
  })

  it('apply in priority order, the first match winning', () => {
    const rules = [prule({ id: 'R02', priority: 2, searchWord: 'Storebælt', handling: 'exclude', factorCode: null }), prule({ id: 'R10', searchWord: 'Storebælt' })]
    expect(classify(posting({ text: 'Storebælt bro' }), [], none, book([account()], rules))).toMatchObject({ status: 'excluded', factorId: null, hit: { rule: { id: 'R02' } } })
  })

  it('apply only to postings whose account is in the rule\'s category', () => {
    const r = prule({ appliesTo: 2, searchWord: 'Volvo', handling: 'pending', factorCode: 'EXIO-VEH' })
    expect(classify(posting({ text: 'Volvo' }), [], none, book([account()], [r])).hit.kind).toBe('account')
    expect(classify(posting({ text: 'Volvo' }), [], none, book([account({ category: 2 })], [r])).status).toBe('pending')
  })

  it('apply to every category when no category is given', () => {
    const r = prule({ id: 'R01', appliesTo: null, searchWord: 'Loyalty Bonus', handling: 'exclude', factorCode: null })
    expect(classify(posting({ text: 'Hens. Loyalty Bonus 2026' }), [], none, book([account({ category: 1 })], [r])).status).toBe('excluded')
  })

  it('never pull in a posting on an excluded account', () => {
    const r = prule({ appliesTo: null, searchWord: 'Taxi' })
    expect(classify(posting({ text: 'Taxi' }), [], none, book([account({ include: false })], [r])).status).toBe('excluded')
  })

  it('move a posting to another category, with the rule\'s factor', () => {
    const r = prule({ id: 'R23', searchWord: 'GBTFEE', factorCode: 'EXIO-OBS', moveTo: 1 })
    const c = classify(posting({ text: 'GBTFEE 2026-04' }), [], none, book([account()], [r]))
    expect(c).toMatchObject({ status: 'included', category: 1, factorId: 'f-exio-obs-dk' })
    expect(ledgerSpendLines([c], 1)).toHaveLength(1)
    expect(ledgerSpendLines([c], 6)).toHaveLength(0)
  })

  it('keep the account\'s factor when they give none', () => {
    const r = prule({ factorCode: null, handling: 'review' })
    expect(classify(posting({ text: 'DSB ' }), [], none, book([account()], [r]))).toMatchObject({ status: 'review', factorId: 'f-exio-land' })
  })

  it('leave pending postings out of the spend lines', () => {
    const r = prule({ handling: 'pending' })
    expect(ledgerSpendLines([classify(posting({ text: 'DSB ' }), [], none, book([account()], [r]))], 6)).toEqual([])
  })

  it('never match an empty search word', () => {
    expect(postingRuleMatches(prule({ searchWord: '' }), { text: 'x', supplier: '' }, 6)).toBe(false)
  })
})

describe('exceptions and manual actions', () => {
  it('let a user exception win over the posting rules', () => {
    const c = classify(posting({ text: 'DSB rejse' }), [exception()], none, book([account()], [prule()]))
    expect(c).toMatchObject({ status: 'excluded', hit: { kind: 'exception' }, category: 6 })
  })

  it('let an exception give a specific factor and category', () => {
    const c = classify(posting({ text: 'DSB rejse' }), [exception({ type: 'tag', factorId: 'f-exio-sea', category: 6 })], none, book([account()], [prule()]))
    expect(c).toMatchObject({ status: 'included', factorId: 'f-exio-sea', category: 6 })
  })

  it('let a manual action win over everything, keeping the account\'s category when it gives none', () => {
    const manual = new Map([['p1', { postingId: 'p1', type: 'exclude', factorId: null, category: null, reason: 'Fejlpostering' } as ManualAction]])
    expect(classify(posting({ text: 'DSB ' }), [exception()], manual, book([account()], [prule()]))).toMatchObject({ status: 'excluded', hit: { kind: 'manual' }, category: 6 })
  })
})

describe('an override on a single posting', () => {
  it('overrides the account mapping and a pending posting rule: factor, category and status', () => {
    const r = prule({ id: 'R27', appliesTo: 2, searchWord: 'Volvo', handling: 'pending', factorCode: 'EXIO-VEH' })
    const b = book([account({ account: '630003', category: 2, factorCode: 'EXIO-CONS' })], [r])
    const volvo = posting({ id: 'v', account: '630003', text: 'Volvo XC60' })
    expect(classify(volvo, [], none, b).status).toBe('pending')
    const manual = new Map([['v', { postingId: 'v', type: 'tag', factorId: 'f-exio-vehicle-repair', category: 1, reason: 'Firmabil' } as ManualAction]])
    const c = classify(volvo, [], manual, b)
    expect(c).toMatchObject({ status: 'included', factorId: 'f-exio-vehicle-repair', category: 1, hit: { kind: 'manual' }, reason: 'Firmabil' })
    expect(ledgerSpendLines([c], 1)).toHaveLength(1)
    expect(ledgerSpendLines([c], 2)).toHaveLength(0)
  })

  it('touches only that posting', () => {
    const b = book([account()])
    const manual = new Map([['p1', { postingId: 'p1', type: 'exclude', factorId: null, category: 6, reason: 'Privat' } as ManualAction]])
    expect(classify(posting(), [], manual, b).status).toBe('excluded')
    expect(classify(posting({ id: 'p2' }), [], manual, b).status).toBe('included')
  })

  it('wins over an account that is not included', () => {
    const manual = new Map([['p1', { postingId: 'p1', type: 'tag', factorId: 'f-exio-obs-dk', category: 1, reason: 'Konsulent' } as ManualAction]])
    expect(classify(posting(), [], manual, book([account({ include: false })])).status).toBe('included')
  })
})

describe('summary and labels', () => {
  it('count each status', () => {
    const b = book([account(), account({ account: '1', include: false }), account({ account: '2', basis: 'Skøn – bekræft' })], [prule({ handling: 'pending' })])
    const cs = classifyLedger({
      postings: [posting({ id: 'a' }), posting({ id: 'b', account: '1' }), posting({ id: 'c', account: '2' }), posting({ id: 'd', text: 'DSB ' }), posting({ id: 'e', account: '3' })],
      rules: [], manual: {},
    }, b)
    expect(ledgerSummary(cs)).toEqual({ total: 5, included: 1, excluded: 1, review: 1, pending: 1, untagged: 1, manual: 0 })
  })

  it('name the rule that hit', () => {
    expect(hitLabel({ kind: 'posting', rule: prule() })).toBe('R10 «DSB »')
    expect(hitLabel({ kind: 'account', rule: account() })).toBe('Kontoregel 240003')
  })

  it('reads "Scope 3.n" as a category number', () => {
    expect(parseScope3Category('Scope 3.15')).toBe(15)
    expect(parseScope3Category('Scope 3.16')).toBeNull()
    expect(parseScope3Category('')).toBeNull()
  })
})

describe('the ESG owner\'s seed rules', () => {
  it('have one rule per account', () => {
    expect(new Set(accountRules.map((r) => r.account)).size).toBe(accountRules.length)
  })

  it('give every included account a category, and only Ja/Nej rows', () => {
    for (const r of accountRules.filter((x) => x.include)) expect(r.category, r.account).not.toBeNull()
  })

  it('keep the posting rules in priority order, with unique ids', () => {
    expect(postingRules.map((r) => r.priority)).toEqual([...postingRules.map((r) => r.priority)].sort((a, b) => a - b))
    expect(new Set(postingRules.map((r) => r.id)).size).toBe(postingRules.length)
  })

  it('keep search words exactly as written', () => {
    expect(postingRules.find((r) => r.id === 'R10')?.searchWord).toBe('DSB ')
    expect(postingRules.find((r) => r.id === 'R44')?.searchWord).toBe('dsb.')
  })

  it('have no estimates left to confirm (confirmed by the ESG owner 2026-11-12)', () => {
    expect(accountRules.filter((r) => r.basis === 'Skøn – bekræft')).toEqual([])
    expect(accountRules.filter((r) => r.basis === 'Bekræftet')).toHaveLength(14)
  })

  it('keep no approver initials', () => {
    for (const r of postingRules) expect(Object.keys(r)).not.toContain('approvedBy')
  })

  it('use only FaktorIDs in the register, and the register only factors that exist', () => {
    const codes = new Set(spendFactorRegister.map((r) => r.code))
    for (const c of [...accountRules.map((r) => r.factorCode), ...postingRules.map((r) => r.factorCode)]) if (c) expect(codes, c).toContain(c)
    for (const r of spendFactorRegister) expect(factors.some((f) => f.id === r.factorId && f.method === 'spend'), r.code).toBe(true)
  })

  it('tag a DSB train ticket on the transport account to rail', () => {
    const c = classify(posting({ text: 'DSB Billet Aarhus-Kbh' }), [], none)
    expect(c).toMatchObject({ status: 'included', category: 6, factorId: 'f-exio-rail', hit: { rule: { id: 'R10' } } })
  })

  it('exclude a Loyalty Bonus on Diverse omkostninger (R01)', () => {
    expect(classify(posting({ account: '101121', text: 'Hens. Loyalty Bonus 2026' }), [], none)).toMatchObject({ status: 'excluded', hit: { rule: { id: 'R01' } } })
  })
})
