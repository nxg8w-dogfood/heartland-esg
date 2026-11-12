// Importing ledger postings from a chart of accounts, and tagging them to a Scope 3 category
// and emission factor by rules or by hand. Ported from the original app.
//
// The ESG owner's account and posting rules decide most postings (spendRules.ts, ADR 0015). The
// user's own rules are exceptions on top: applied in order, the first match wins, and a rule
// matches when all its conditions with a value match. A manual action on a posting overrides
// everything. Postings that count become spend lines in their category.

import { registeredFactor } from '../data/spendFactorRegister'
import { accountRules as seedAccountRules, postingRules as seedPostingRules } from '../data/scope3Rules'
import type { SpendGroup, SpendLine } from './spend'
import { firstPostingRule, type AccountRule, type PostingHandling, type PostingRule } from './spendRules'

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

  return tableToRows(records) as { headers: string[]; rows: Record<string, string>[] }
}

/**
 * Header row plus data rows, from a parsed CSV or the first sheet of a spreadsheet. Blank rows
 * are skipped. Blank headers become "Kolonne N" and repeated ones get a number, so no column
 * is lost when rows become objects.
 */
export function tableToRows(table: readonly (readonly CellValue[])[]): { headers: string[]; rows: TableRow[] } {
  const isBlank = (v: CellValue) => v == null || (typeof v === 'string' && v.trim() === '')
  const nonEmpty = table.filter((r) => r.some((v) => !isBlank(v)))
  if (nonEmpty.length === 0) return { headers: [], rows: [] }
  const width = Math.max(...nonEmpty.map((r) => r.length))
  const seen = new Map<string, number>()
  const headers = Array.from({ length: width }, (_, i) => {
    const raw = cellText(nonEmpty[0][i]) || `Kolonne ${i + 1}`
    const n = (seen.get(raw) ?? 0) + 1
    seen.set(raw, n)
    return n === 1 ? raw : `${raw} (${n})`
  })
  const rows = nonEmpty.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])))
  return { headers, rows }
}

/** A cell value from a CSV (always text) or a spreadsheet (text, number, boolean or date). */
export type CellValue = string | number | boolean | Date | null | undefined

const EXCEL_EPOCH = Date.UTC(1899, 11, 30)

/** ISO date for an Excel date serial (1900 date system), e.g. 45747 → "2025-03-31". */
export function excelSerialToDate(serial: number): string {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return ''
  return new Date(EXCEL_EPOCH + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10)
}

/**
 * ISO date from "2025-03-31…", "31.03.2025", "31-3-25", "31/03/2025", anything Date.parse reads,
 * a spreadsheet date cell, or an Excel date serial (a date cell that lost its date format).
 */
export function parseLedgerDate(value: CellValue): string {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  if (typeof value === 'number') return excelSerialToDate(value)
  if (value == null || value === '' || typeof value === 'boolean') return ''
  const t = String(value).trim()
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dk = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  if (dk) return `${dk[3].length === 2 ? `20${dk[3]}` : dk[3]}-${dk[2].padStart(2, '0')}-${dk[1].padStart(2, '0')}`
  const ms = Date.parse(t)
  return Number.isNaN(ms) ? '' : new Date(ms).toISOString().slice(0, 10)
}

/** Amount from Danish or plain notation ("1.234,50", "-120", "1 234,5"). Null when unreadable. */
export function parseLedgerAmount(value: CellValue): number | null {
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

export type TableRow = Record<string, CellValue>

/** Text for a cell used as text (account, name, supplier…): numbers as written, dates as ISO. */
const cellText = (v: CellValue) => (v instanceof Date ? parseLedgerDate(v) : v == null ? '' : String(v)).trim()

export function rowsToPostings(rows: readonly TableRow[], mapping: ColumnMapping): Omit<Posting, 'id' | 'importId'>[] {
  const get = (row: TableRow, f: LedgerField) => (mapping[f] ? row[mapping[f]] : undefined)
  return rows.map((row) => ({
    date: parseLedgerDate(get(row, 'date')),
    account: cellText(get(row, 'account')),
    accountName: cellText(get(row, 'accountName')),
    supplier: cellText(get(row, 'supplier')),
    text: cellText(get(row, 'text')),
    amount: parseLedgerAmount(get(row, 'amount')),
    currency: cellText(get(row, 'currency')) || 'DKK',
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

/**
 * Included and for review count in the climate account; for review is flagged for someone to
 * confirm. Pending waits for a decision and doesn't count yet. Untagged has no rule at all.
 */
export type PostingStatus = 'included' | 'review' | 'pending' | 'excluded' | 'untagged'

export const postingStatusLabels: Record<PostingStatus, string> = {
  included: 'Medtaget',
  review: 'Til review',
  pending: 'Afventer',
  excluded: 'Udeladt',
  untagged: 'Utagget',
}

/** The rule that decided a posting's status. */
export type RuleHit =
  | { kind: 'manual' }
  | { kind: 'exception'; rule: Rule }
  | { kind: 'posting'; rule: PostingRule }
  | { kind: 'account'; rule: AccountRule }
  | { kind: 'none' }

export type ClassifiedPosting = {
  posting: Posting
  status: PostingStatus
  hit: RuleHit
  /** The factor in the factor table */
  factorId: string | null
  /** The Scope 3 category it counts in (or would, if excluded or pending) */
  category: number | null
  reason: string
}

/** The ESG owner's built-in rules and the factor register they're resolved through. */
export type RuleBook = {
  accountRules: readonly AccountRule[]
  /** In priority order */
  postingRules: readonly PostingRule[]
  /** FaktorID → factor table id */
  factorFor: (code: string | null) => string | null
}

export const builtinRuleBook: RuleBook = {
  accountRules: seedAccountRules,
  postingRules: seedPostingRules,
  factorFor: (code) => registeredFactor(code)?.factorId ?? null,
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

const statusFor: Record<PostingHandling, PostingStatus> = { exclude: 'excluded', include: 'included', review: 'review', pending: 'pending' }

/**
 * Decides one posting, in this order (docs/adr/0015):
 * 1. a manual action on the posting;
 * 2. the user's own exceptions (`rules`), in order, the first that matches;
 * 3. the account rule for the posting's account. An account that isn't in the rules is untagged,
 *    and one that isn't included is excluded;
 * 4. for an included account, the first posting rule by priority whose search word is in the
 *    posting's text or supplier, and that applies to the account's category. It can exclude the
 *    posting, override its factor, move it to another category, or flag it for review or as
 *    pending;
 * 5. otherwise the account rule: included, or for review when its basis is an estimate to confirm.
 */
export function classify(posting: Posting, rules: readonly Rule[], manual: ReadonlyMap<string, ManualAction>, book: RuleBook = builtinRuleBook): ClassifiedPosting {
  const accountRule = book.accountRules.find((r) => r.account === posting.account.trim()) ?? null
  const m = manual.get(posting.id)
  if (m) {
    const exclude = m.type === 'exclude'
    return {
      posting, status: exclude ? 'excluded' : 'included', hit: { kind: 'manual' },
      factorId: exclude ? null : m.factorId, category: m.category ?? accountRule?.category ?? null, reason: m.reason,
    }
  }
  const exception = rules.find((r) => ruleMatches(r, posting))
  if (exception) {
    const tag = exception.type === 'tag'
    return {
      posting, status: tag ? 'included' : 'excluded', hit: { kind: 'exception', rule: exception },
      factorId: tag ? exception.factorId : null, category: tag ? exception.category : (accountRule?.category ?? null), reason: exception.reason,
    }
  }
  if (!accountRule) return { posting, status: 'untagged', hit: { kind: 'none' }, factorId: null, category: null, reason: '' }
  if (!accountRule.include) {
    return { posting, status: 'excluded', hit: { kind: 'account', rule: accountRule }, factorId: null, category: accountRule.category, reason: accountRule.reason }
  }
  const postingRule = firstPostingRule(book.postingRules, posting, accountRule.category)
  if (postingRule) {
    const status = statusFor[postingRule.handling]
    return {
      posting, status, hit: { kind: 'posting', rule: postingRule },
      factorId: status === 'excluded' ? null : book.factorFor(postingRule.factorCode ?? accountRule.factorCode),
      category: postingRule.moveTo ?? accountRule.category,
      reason: postingRule.reason,
    }
  }
  return {
    posting, status: accountRule.basis === 'Skøn – bekræft' ? 'review' : 'included', hit: { kind: 'account', rule: accountRule },
    factorId: book.factorFor(accountRule.factorCode), category: accountRule.category, reason: accountRule.reason,
  }
}

export function classifyLedger(ledger: { postings: readonly Posting[]; rules: readonly Rule[]; manual: Record<string, ManualAction> }, book: RuleBook = builtinRuleBook): ClassifiedPosting[] {
  const manual = new Map(Object.entries(ledger.manual))
  return ledger.postings.map((p) => classify(p, ledger.rules, manual, book))
}

/** Counts in the climate account */
export const counts = (c: ClassifiedPosting) => c.status === 'included' || c.status === 'review'

/** The rule that hit, in a few words, e.g. "R10 «DSB »" or "Kontoregel 240003". */
export function hitLabel(hit: RuleHit): string {
  switch (hit.kind) {
    case 'manual': return 'Manuel handling'
    case 'exception': return `Undtagelse: ${hit.rule.name}`
    case 'posting': return `${hit.rule.id} «${hit.rule.searchWord}»`
    case 'account': return `Kontoregel ${hit.rule.account}`
    case 'none': return 'Ingen regel'
  }
}

export type LedgerSummary = Record<PostingStatus, number> & { total: number; manual: number }

export function ledgerSummary(classified: readonly ClassifiedPosting[]): LedgerSummary {
  const s: LedgerSummary = { total: classified.length, included: 0, review: 0, pending: 0, excluded: 0, untagged: 0, manual: 0 }
  for (const c of classified) {
    s[c.status] += 1
    if (c.hit.kind === 'manual') s.manual += 1
  }
  return s
}

/**
 * Spend lines for the postings that count in a category: the account becomes the line's group,
 * the rule's factor its factor.
 */
export function ledgerSpendLines(classified: readonly ClassifiedPosting[], category: number): LedgerSpendLine[] {
  return classified
    .filter((c) => counts(c) && c.category === category)
    .map((c) => {
      const p = c.posting
      const group = `konto-${p.account || 'ukendt'}`
      return {
        line: {
          id: `kp-${p.id}`,
          group,
          date: p.date,
          dateTo: null,
          amount: p.amount,
          currency: p.currency,
          factorId: c.factorId,
          description: [p.supplier, p.text].filter(Boolean).join(' — ') || `Postering ${p.account}`,
        },
        group: {
          id: group,
          label: p.accountName || `Konto ${p.account}`,
          sector: `${hitLabel(c.hit)}${c.status === 'review' ? ' · til review' : ''}`,
          factorId: c.factorId ?? '',
        },
      }
    })
}

export type LedgerSpendLine = { line: SpendLine; group: SpendGroup }
