import { describe, expect, it } from 'vitest'
import { currencyRates } from '../data/currencies'
import { factors } from '../data/factors'
import {
  classify, conditionMatches, guessColumn, guessMapping, ledgerSpendLines, ledgerSummary, parseCsv, parseLedgerAmount,
  parseLedgerDate, rowsToPostings, ruleMatches, type ManualAction, type Posting, type Rule,
} from './ledger'
import { category1 } from './scope3'
import { noDeflation } from './spend'

const posting = (o: Partial<Posting> = {}): Posting => ({
  id: 'p1', importId: 'i1', date: '2025-03-31', account: '6100', accountName: 'Revision', supplier: 'Deloitte', text: 'Faktura 2025-117',
  amount: 746_040, currency: 'DKK', ...o,
})
const rule = (o: Partial<Rule> = {}): Rule => ({
  id: 'r1', name: 'Revision', type: 'tag', active: true, conditions: [{ id: 'c1', field: 'account', operator: 'is', value: '6100' }],
  factorId: 'f-exio-obs-dk', category: 1, reason: 'Rådgivning', ...o,
})
const none = new Map<string, ManualAction>()

describe('parseCsv', () => {
  it('reads a semicolon-separated Danish export with a byte-order mark', () => {
    const { headers, rows } = parseCsv('\uFEFFDato;Konto;Tekst;Beløb\r\n31.03.2025;6100;Revision;7.460,40\r\n')
    expect(headers).toEqual(['Dato', 'Konto', 'Tekst', 'Beløb'])
    expect(rows).toEqual([{ Dato: '31.03.2025', Konto: '6100', Tekst: 'Revision', Beløb: '7.460,40' }])
  })

  it('detects commas and tabs', () => {
    expect(parseCsv('a,b\n1,2').rows).toEqual([{ a: '1', b: '2' }])
    expect(parseCsv('a\tb\n1\t2').rows).toEqual([{ a: '1', b: '2' }])
  })

  it('handles quoted fields with delimiters, quotes and line breaks', () => {
    const { rows } = parseCsv('Tekst;Beløb\n"Licens; Q1 ""Pro""";100\n"Linje 1\nLinje 2";5')
    expect(rows[0].Tekst).toBe('Licens; Q1 "Pro"')
    expect(rows[1].Tekst).toBe('Linje 1\nLinje 2')
  })

  it('skips blank lines and fills missing cells with empty strings', () => {
    expect(parseCsv('a;b;c\n\n1;2\n').rows).toEqual([{ a: '1', b: '2', c: '' }])
  })

  it('gives nothing for an empty file', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] })
  })
})

describe('parsing values (checked against the original)', () => {
  it.each([
    ['1.234,50', 1234.5], ['-120', -120], ['1 234,5', 1234.5], ['12.345.678', 12345678], ['0,5', 0.5], ['', 0], ['abc', 0],
  ] as const)('amount %j → %d', (input, expected) => {
    expect(parseLedgerAmount(input)).toBe(expected)
  })

  it('returns null for amounts the original cannot read', () => {
    expect(parseLedgerAmount('1,234.56')).toBeNull()
    expect(parseLedgerAmount(Number.NaN)).toBeNull()
    expect(parseLedgerAmount(null)).toBeNull()
  })

  it.each([
    ['2025-03-31', '2025-03-31'], ['2025-03-31T10:00', '2025-03-31'], ['31.03.2025', '2025-03-31'], ['1.3.25', '2025-03-01'], ['31/12/2024', '2024-12-31'], ['', ''], ['nope', ''],
  ] as const)('date %j → %j', (input, expected) => {
    expect(parseLedgerDate(input)).toBe(expected)
  })

  it('guesses columns by exact name first, then by containing an alias', () => {
    const headers = ['Bilagsdato', 'Kontonr.', 'Kontotekst', 'Kreditor', 'Beskrivelse', 'Debet', 'Valuta']
    expect(guessMapping(headers)).toEqual({ date: 'Bilagsdato', account: 'Kontonr.', accountName: 'Kontotekst', supplier: 'Kreditor', text: 'Beskrivelse', amount: 'Debet', currency: 'Valuta' })
    expect(guessColumn(['x', 'y'], 'amount')).toBe('')
  })

  it('turns rows into postings with DKK as the default currency', () => {
    const [p] = rowsToPostings([{ Dato: '31.03.2025', Konto: ' 6100 ', Beløb: '7.460,40' }], { date: 'Dato', account: 'Konto', accountName: '', supplier: '', text: '', amount: 'Beløb', currency: '' })
    expect(p).toEqual({ date: '2025-03-31', account: '6100', accountName: '', supplier: '', text: '', amount: 7460.4, currency: 'DKK' })
  })
})

describe('rules', () => {
  it('match case- and space-insensitively', () => {
    expect(conditionMatches({ id: 'c', field: 'supplier', operator: 'is', value: ' DELOITTE ' }, posting())).toBe(true)
    expect(conditionMatches({ id: 'c', field: 'account', operator: 'startsWith', value: '61' }, posting())).toBe(true)
    expect(conditionMatches({ id: 'c', field: 'text', operator: 'contains', value: '2025' }, posting())).toBe(true)
    expect(conditionMatches({ id: 'c', field: 'account', operator: 'is', value: '61' }, posting())).toBe(false)
  })

  it('need all filled-in conditions to match; empty ones are ignored', () => {
    const r = rule({ conditions: [{ id: 'a', field: 'account', operator: 'is', value: '6100' }, { id: 'b', field: 'supplier', operator: 'contains', value: 'pwc' }] })
    expect(ruleMatches(r, posting())).toBe(false)
    expect(ruleMatches(rule({ conditions: [...rule().conditions, { id: 'b', field: 'supplier', operator: 'is', value: '  ' }] }), posting())).toBe(true)
  })

  it('never match when inactive or without a filled-in condition', () => {
    expect(ruleMatches(rule({ active: false }), posting())).toBe(false)
    expect(ruleMatches(rule({ conditions: [{ id: 'c', field: 'account', operator: 'is', value: '' }] }), posting())).toBe(false)
  })
})

describe('classify', () => {
  it('uses the first matching rule, in order', () => {
    const first = rule({ id: 'first', factorId: 'f-exio-obs-se' })
    const second = rule({ id: 'second' })
    expect(classify(posting(), [first, second], none).rule?.id).toBe('first')
    expect(classify(posting(), [second, first], none).rule?.id).toBe('second')
  })

  it('skips inactive rules and falls through to the next', () => {
    expect(classify(posting(), [rule({ id: 'off', active: false }), rule({ id: 'on' })], none).rule?.id).toBe('on')
  })

  it('excludes by an exclude rule, without a factor or category', () => {
    const c = classify(posting(), [rule({ type: 'exclude', reason: 'Ikke klimarelevant' })], none)
    expect(c).toMatchObject({ status: 'excluded', source: 'rule', factorId: null, category: null, reason: 'Ikke klimarelevant' })
  })

  it('lets a manual action override the rules', () => {
    const manual = new Map([['p1', { postingId: 'p1', type: 'exclude', factorId: null, category: null, reason: 'Intern omposting' } as ManualAction]])
    expect(classify(posting(), [rule()], manual)).toMatchObject({ status: 'excluded', source: 'manual', rule: null })
  })

  it('leaves unmatched postings untagged', () => {
    expect(classify(posting({ account: '1000' }), [rule()], none)).toMatchObject({ status: 'untagged', source: 'none' })
  })

  it('counts statuses and manual actions', () => {
    const manual = new Map([['p3', { postingId: 'p3', type: 'tag', factorId: 'f-exio-obs-dk', category: 1, reason: '' } as ManualAction]])
    const cs = [posting(), posting({ id: 'p2', account: '1000' }), posting({ id: 'p3', account: '1000' })].map((p) => classify(p, [rule()], manual))
    expect(ledgerSummary(cs)).toEqual({ total: 3, tagged: 2, excluded: 0, untagged: 1, manual: 1 })
  })
})

describe('tagged postings in category 1', () => {
  const period = { start: '2025-01-01', end: '2025-12-31' }

  it('become spend lines typed by their account, and count in category 1', () => {
    const cs = [posting()].map((p) => classify(p, [rule()], none))
    const lines = ledgerSpendLines(cs, 1)
    expect(lines[0].group).toMatchObject({ label: 'Revision', sector: 'Regel: Revision', factorId: 'f-exio-obs-dk' })
    expect(lines[0].line.description).toBe('Deloitte — Faktura 2025-117')
    const c1 = category1([], factors, currencyRates, noDeflation, period, lines)
    expect(c1.total).toBeCloseTo((100_000 * 0.1272) / 1000, 9)
    expect(c1.lines[0].source).toBe('ledger')
  })

  it('leave out untagged, excluded and other-category postings', () => {
    const cs = [
      classify(posting({ id: 'a', account: '1000' }), [rule()], none),
      classify(posting({ id: 'b' }), [rule({ type: 'exclude' })], none),
      classify(posting({ id: 'c' }), [rule({ category: 6 })], none),
    ]
    expect(ledgerSpendLines(cs, 1)).toEqual([])
  })

  it('are pending when tagged without a factor', () => {
    const lines = ledgerSpendLines([classify(posting(), [rule({ factorId: null })], none)], 1)
    expect(category1([], factors, currencyRates, noDeflation, period, lines).pendingCount).toBe(1)
  })
})
