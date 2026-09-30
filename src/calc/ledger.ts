// Importing ledger postings from a chart of accounts, and tagging them to a Scope 3 category
// and emission factor by rules or by hand. Ported from the original app.
//
// Rules are applied in order and the first match wins. A rule matches when all its conditions
// with a value match. A manual action on a posting overrides the rules. Tagged postings become
// spend lines in their category.

import type { SpendGroup, SpendLine } from './spend'

export type LedgerField = 'date' | 'account' | 'accountName' | 'supplier' | 'text' | 'amount' | 'currency'

export const ledgerFieldLabels: Record<LedgerField, string> = {
  date: 'Dato',
  account: 'Kontonummer',
  accountName: 'Kontonavn',
  supplier: 'Leverandør',
  text: 'Posteringstekst',
  amount: 'Beløb',
  currency: 'Valuta',
}

/** Header names recognised for each field: exact match first, then "contains", as in the original. */
const aliases: Record<LedgerField, string[]> = {
  date: ['dato', 'date', 'bilagsdato', 'posteringsdato'],
  account: ['konto', 'kontonr', 'kontonummer', 'account'],
  accountName: ['kontonavn', 'kontotekst', 'account name', 'kontobetegnelse'],
  supplier: ['leverandør', 'leverandoer', 'kreditor', 'supplier', 'vendor'],
  text: ['tekst', 'posteringstekst', 'beskrivelse', 'description', 'bilagstekst'],
  amount: ['beløb', 'beloeb', 'amount', 'debet', 'værdi'],
  currency: ['valuta', 'currency'],
}

export function guessColumn(headers: readonly string[], field: LedgerField): string {
  const lower = headers.map((h) => h.toLowerCase().trim())
  for (const a of aliases[field]) {
    const i = lower.findIndex((h) => h === a)
    if (i !== -1) return headers[i]
  }
  for (const a of aliases[field]) {
    const i = lower.findIndex((h) => h.includes(a))
    if (i !== -1) return headers[i]
  }
  return ''
}

/**
 * Reads a CSV export. The delimiter (semicolon, comma or tab) is taken from the header line;
 * Danish exports usually use semicolons. Quoted fields may contain delimiters, quotes ("")
 * and line breaks. A leading byte-order mark is ignored.
 */
export function parseCsv(input: string): { headers: string[]; rows: Record<string, string>[] } {
  const text = input.replace(/^\uFEFF/, '')
  const firstLine = text.slice(0, text.search(/\r?\n|$/))
  const counts = [';', ',', '\t'].map((d) => [d, firstLine.split(d).length - 1] as const)
  const delimiter = counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ';'

  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === delimiter) { record.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      record.push(field); field = ''
      records.push(record); record = []
    } else field += c
  }
  if (field !== '' || record.length > 0) { record.push(field); records.push(record) }

  const nonEmpty = records.filter((r) => r.some((v) => v.trim() !== ''))
  if (nonEmpty.length === 0) return { headers: [], rows: [] }
  const headers = nonEmpty[0].map((h) => h.trim())
  const rows = nonEmpty.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])))
  return { headers, rows }
}

/** ISO date from "2025-03-31…", "31.03.2025", "31-3-25", "31/03/2025", or anything Date.parse reads. */
export function parseLedgerDate(value: string | null | undefined): string {
  if (value == null || value === '') return ''
  const t = String(value).trim()
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dk = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  if (dk) return `${dk[3].length === 2 ? `20${dk[3]}` : dk[3]}-${dk[2].padStart(2, '0')}-${dk[1].padStart(2, '0')}`
  const ms = Date.parse(t)
  return Number.isNaN(ms) ? '' : new Date(ms).toISOString().slice(0, 10)
}

/** Amount from Danish or plain notation ("1.234,50", "-120", "1 234,5"). Null when unreadable. */
export function parseLedgerAmount(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const t = value.replace(/\s|\u00a0/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
  const n = Number(t.replace(/[^0-9.-]/g, ''))
  return Number.isNaN(n) ? null : n
}

export type Posting = {
  id: string
  importId: string
  date: string
  account: string
  accountName: string
  supplier: string
  text: string
  amount: number | null
  currency: string
}

export type ImportBatch = { id: string; fileName: string; importedAt: string; count: number }

export type ColumnMapping = Record<LedgerField, string>

export function guessMapping(headers: readonly string[]): ColumnMapping {
  return Object.fromEntries((Object.keys(ledgerFieldLabels) as LedgerField[]).map((f) => [f, guessColumn(headers, f)])) as ColumnMapping
}

export function rowsToPostings(rows: readonly Record<string, string>[], mapping: ColumnMapping): Omit<Posting, 'id' | 'importId'>[] {
  const get = (row: Record<string, string>, f: LedgerField) => (mapping[f] ? row[mapping[f]] : undefined)
  return rows.map((row) => ({
    date: parseLedgerDate(get(row, 'date')),
    account: String(get(row, 'account') ?? '').trim(),
    accountName: String(get(row, 'accountName') ?? '').trim(),
    supplier: String(get(row, 'supplier') ?? '').trim(),
    text: String(get(row, 'text') ?? '').trim(),
    amount: parseLedgerAmount(get(row, 'amount')),
    currency: String(get(row, 'currency') ?? 'DKK').trim() || 'DKK',
  }))
}

export type ConditionField = 'account' | 'accountName' | 'supplier' | 'text'
export type ConditionOperator = 'is' | 'startsWith' | 'contains'

export type Condition = { id: string; field: ConditionField; operator: ConditionOperator; value: string }

export type Rule = {
  id: string
  name: string
  /** Tag to a category and factor, or exclude from the climate account */
  type: 'tag' | 'exclude'
  active: boolean
  conditions: Condition[]
  factorId: string | null
  category: number
  reason: string
}

export type ManualAction = {
  postingId: string
  type: 'tag' | 'exclude'
  factorId: string | null
  category: number | null
  reason: string
}

export type PostingStatus = 'tagged' | 'excluded' | 'untagged'

export type ClassifiedPosting = {
  posting: Posting
  status: PostingStatus
  source: 'manual' | 'rule' | 'none'
  rule: Rule | null
  factorId: string | null
  category: number | null
  reason: string
}

const norm = (s: string) => s.trim().toLowerCase()

export function conditionMatches(condition: Condition, posting: Posting): boolean {
  const wanted = norm(condition.value)
  if (!wanted) return false
  const actual = norm(posting[condition.field] ?? '')
  if (condition.operator === 'is') return actual === wanted
  if (condition.operator === 'startsWith') return actual.startsWith(wanted)
  return actual.includes(wanted)
}

/** An inactive rule, or one with no filled-in condition, never matches. */
export function ruleMatches(rule: Rule, posting: Posting): boolean {
  if (!rule.active) return false
  const filled = rule.conditions.filter((c) => c.value.trim() !== '')
  return filled.length > 0 && filled.every((c) => conditionMatches(c, posting))
}

export function classify(posting: Posting, rules: readonly Rule[], manual: ReadonlyMap<string, ManualAction>): ClassifiedPosting {
  const m = manual.get(posting.id)
  if (m) {
    return {
      posting, status: m.type === 'exclude' ? 'excluded' : 'tagged', source: 'manual', rule: null,
      factorId: m.factorId, category: m.category, reason: m.reason,
    }
  }
  for (const rule of rules) {
    if (!ruleMatches(rule, posting)) continue
    const tag = rule.type === 'tag'
    return {
      posting, status: tag ? 'tagged' : 'excluded', source: 'rule', rule,
      factorId: tag ? rule.factorId : null, category: tag ? rule.category : null, reason: rule.reason,
    }
  }
  return { posting, status: 'untagged', source: 'none', rule: null, factorId: null, category: null, reason: '' }
}

export type LedgerSummary = { total: number; tagged: number; excluded: number; untagged: number; manual: number }

export function ledgerSummary(classified: readonly ClassifiedPosting[]): LedgerSummary {
  const s = { total: classified.length, tagged: 0, excluded: 0, untagged: 0, manual: 0 }
  for (const c of classified) {
    s[c.status] += 1
    if (c.source === 'manual') s.manual += 1
  }
  return s
}

/**
 * Spend lines for the postings tagged to a category, as in the original: the account becomes
 * the line's type, the rule's or manual factor its factor.
 */
export function ledgerSpendLines(classified: readonly ClassifiedPosting[], category: number): LedgerSpendLine[] {
  return classified
    .filter((c) => c.status === 'tagged' && c.category === category)
    .map((c) => {
      const p = c.posting
      return {
        line: {
          id: `kp-${p.id}`,
          group: `konto-${p.account || 'ukendt'}`,
          date: p.date,
          dateTo: null,
          amount: p.amount,
          currency: p.currency,
          factorId: c.factorId,
          description: [p.supplier, p.text].filter(Boolean).join(' — ') || `Postering ${p.account}`,
        },
        group: {
          id: `konto-${p.account || 'ukendt'}`,
          label: p.accountName || `Konto ${p.account}`,
          sector: c.source === 'manual' ? 'Manuelt tagget postering' : `Regel: ${c.rule?.name ?? ''}`,
          factorId: c.factorId ?? '',
        },
      }
    })
}

export type LedgerSpendLine = { line: SpendLine; group: SpendGroup }
