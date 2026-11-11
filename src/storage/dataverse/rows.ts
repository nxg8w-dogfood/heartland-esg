// The group as Dataverse rows, and back (docs/adr/0005, 0006, 0007). Pure functions, so the
// mapping is tested without an environment; the store (store.ts) only moves rows.
//
// Every row has a key the app can compute from its own data:
//  - records the app gives an id (companies, lines, locations, surveys, investments, imports,
//    postings, rules) use that id, which is also the row's Dataverse primary key;
//  - the rest use a natural key, e.g. company + year for an ownership share, and the store maps
//    it to the Dataverse id it was given.
// Lookups are written as the target's key in the lookup column, e.g. hlesg_virksomhedid.

import { defaultCategory3Params } from '../../calc/scope3'
import type { ActivityLine } from '../../calc/activity'
import type { Survey } from '../../calc/commuting'
import type { FactorSourceChoice } from '../../calc/factorSources'
import type { Investment } from '../../calc/investments'
import type { ImportBatch, ManualAction, Posting, Rule } from '../../calc/ledger'
import type { Scope1Line } from '../../calc/scope1'
import type { Location, Scope2Line } from '../../calc/scope2'
import { defaultPriceIndexSeries, noDeflation, type SpendLine } from '../../calc/spend'
import { factors } from '../../data/factors'
import { lineLists, tables, type Choice, type Column } from '../../dataverse/schema'
import { defaultRelevance } from '../../scope3/relevance'
import { ACCOUNT_VERSION, emptyAccount, type AccountData } from '../account'
import { GROUP_VERSION, type Company, type GroupData } from '../group'

export type Value = string | number | boolean | null
export type Row = Record<string, Value>
/** Table → row key → columns */
export type Rows = Record<string, Map<string, Row>>

const c = (s: string) => `hlesg_${s}`
const COMPANY = c('virksomhedid')

/** The key of the group's single hlesg_koncern row */
export const GROUP_KEY = 'koncern'
export const naturalKey = (...parts: (string | number)[]) => parts.join('|')

function choices(table: string, column: string): readonly Choice[] {
  const col = tables.find((t) => t.name === table)?.columns.find((x) => x.name === column) as Extract<Column, { kind: 'choice' }> | undefined
  if (!col) throw new Error(`No choice column ${table}.${column}`)
  return col.options
}
const toChoice = (table: string, column: string, app: string | null | undefined): number | null =>
  app == null ? null : (choices(table, column).find((o) => o.appValue === app)?.value ?? null)
const fromChoice = (table: string, column: string, value: Value): string | null =>
  value == null ? null : (choices(table, column).find((o) => o.value === value)?.appValue ?? null)

const n = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const s = (v: string | null | undefined): string | null => (v == null || v === '' ? null : v)
const num = (v: Value): number | null => (typeof v === 'number' ? v : null)
const str = (v: Value): string => (typeof v === 'string' ? v : '')
const optStr = (v: Value): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

export function emptyRows(): Rows {
  return Object.fromEntries([c('koncern'), ...tables.filter((t) => t.name !== c('koncern')).map((t) => t.name)].map((t) => [t, new Map<string, Row>()]))
}

/** The group as rows. The active company and summary period are the user's view, not stored. */
export function toRows(group: GroupData): Rows {
  const rows = emptyRows()
  const put = (table: string, key: string, row: Row) => rows[table].set(key, row)
  put(c('koncern'), GROUP_KEY, { [c('navn')]: group.name })

  for (const company of group.companies) {
    const id = company.id
    const a = company.account
    put(c('virksomhed'), id, { [c('navn')]: company.name })
    for (const o of company.ownership) put(c('ejerandel'), naturalKey(id, o.fromYear), { [COMPANY]: id, [c('fraaar')]: o.fromYear, [c('procent')]: o.pct })
    put(c('klimaregnskab'), id, {
      [COMPANY]: id,
      [c('periodestart')]: a.period.start,
      [c('periodeslut')]: a.period.end,
      [c('nettab')]: a.category3Params.gridLoss,
      [c('wttratio')]: a.category3Params.wttRatio,
      [c('indeksreguler')]: a.deflation.active,
      [c('indeksserie')]: a.deflation.seriesId,
    })
    for (const l of a.locations) {
      put(c('lokation'), l.id, {
        [COMPANY]: id, [c('navn')]: l.name, [c('elnetfamilie')]: l.gridFamily,
        [c('markedsinstrument')]: toChoice(c('lokation'), c('markedsinstrument'), l.marketInstrument),
        [c('fjernvarmefaktor')]: l.heatingFactorId,
      })
    }
    for (const list of lineLists) {
      for (const line of a[list.appValue as keyof AccountData] as unknown as AnyLine[]) put(c('linje'), line.id, lineRow(id, list.value, line))
    }
    for (const sv of a.surveys) {
      put(c('pendling'), sv.id, {
        [COMPANY]: id, [c('navn')]: sv.label, [c('dato')]: sv.date, [c('medarbejdere')]: sv.employees,
        [c('besvarelser')]: sv.responses, [c('arbejdsuger')]: sv.workWeeksPerYear, [c('svar')]: JSON.stringify(sv.modes),
      })
    }
    for (const i of a.investments) put(c('investering'), i.id, investmentRow(id, i))
    for (const [factorId, choice] of Object.entries(a.factorSources)) {
      if (choice.kind === 'builtin') continue
      put(c('faktorkilde'), naturalKey(id, factorId), factorSourceRow(id, factorId, choice))
    }
    for (const [nr, r] of Object.entries(a.relevance)) {
      put(c('relevans'), naturalKey(id, nr), { [COMPANY]: id, [c('kategori')]: Number(nr), [c('relevant')]: r.relevant, [c('begrundelse')]: r.reason })
    }
    for (const series of a.deflation.series) {
      for (const p of series.points) put(c('indekspunkt'), naturalKey(id, series.id, p.year), { [COMPANY]: id, [c('serie')]: series.id, [c('aar')]: p.year, [c('vaerdi')]: p.value })
    }
    for (const [factorId, f] of Object.entries(a.deflation.factorSettings)) {
      put(c('prisaar'), naturalKey(id, factorId), { [COMPANY]: id, [c('faktorid')]: factorId, [c('basisaar')]: f.baseYear ?? null, [c('serie')]: f.seriesId ?? null })
    }
    for (const b of a.ledger.imports) put(c('import'), b.id, { [COMPANY]: id, [c('filnavn')]: b.fileName, [c('importeret')]: b.importedAt, [c('antal')]: b.count })
    for (const p of a.ledger.postings) put(c('postering'), p.id, postingRow(p, a.ledger.manual[p.id]))
    a.ledger.rules.forEach((r, i) => put(c('regel'), r.id, ruleRow(id, r, i)))
  }
  return rows
}

type AnyLine = Scope1Line | Scope2Line | SpendLine | ActivityLine

function lineRow(company: string, list: number, l: AnyLine): Row {
  const scope2 = 'kind' in l ? l : null
  const spend = 'amount' in l ? l : null
  return {
    [COMPANY]: company,
    [c('liste')]: list,
    [c('gruppe')]: 'group' in l ? l.group : null,
    [c('dato')]: l.date,
    [c('tildato')]: s(l.dateTo),
    [c('maengde')]: scope2 ? n(scope2.kWh) : 'quantity' in l ? n(l.quantity) : null,
    [c('beloeb')]: spend ? n(spend.amount) : null,
    [c('valuta')]: spend ? s(spend.currency) : null,
    [c('faktorid')]: 'factorId' in l ? s(l.factorId) : null,
    [c('egenfaktor')]: n(l.customFactor),
    [c('beskrivelse')]: s(l.description),
    [c('lokationid')]: scope2 ? scope2.locationId : null,
    [c('energiart')]: scope2 ? toChoice(c('linje'), c('energiart'), scope2.kind) : null,
  }
}

function investmentRow(company: string, i: Investment): Row {
  return {
    [COMPANY]: company, [c('selskab')]: s(i.company), [c('dato')]: i.date, [c('ejerandel')]: n(i.ownershipPct),
    [c('regnskabsmetode')]: toChoice(c('investering'), c('regnskabsmetode'), i.accountingMethod),
    [c('klimametode')]: s(i.climateMethod), [c('datakilde')]: s(i.dataSource),
    [c('grundlag')]: toChoice(c('investering'), c('grundlag'), i.basis),
    [c('udledningkg')]: n(i.totalKgCO2e), [c('omsaetningdkk')]: n(i.revenueDKK), [c('omsaetninglokal')]: n(i.revenueLocal),
    [c('lokalvaluta')]: s(i.localCurrency), [c('kurs')]: n(i.rateLocalToDKK), [c('faktorpreur')]: n(i.factorKgPerEUR),
    [c('faktorkilde')]: s(i.factorSource), [c('land')]: s(i.country),
  }
}

function factorSourceRow(company: string, factorId: string, choice: Exclude<FactorSourceChoice, { kind: 'builtin' }>): Row {
  const row: Row = {
    [COMPANY]: company, [c('faktorid')]: factorId, [c('kildetype')]: toChoice(c('faktorkilde'), c('kildetype'), choice.kind),
    [c('publikation')]: null, [c('vaerdi')]: null, [c('kildetekst')]: null, [c('kildedato')]: null,
    [c('udbyder')]: null, [c('forespoergsel')]: null, [c('hentet')]: null,
  }
  if (choice.kind === 'publication') row[c('publikation')] = choice.publicationId
  if (choice.kind === 'manual') Object.assign(row, { [c('vaerdi')]: choice.value, [c('kildetekst')]: choice.source, [c('kildedato')]: s(choice.date) })
  if (choice.kind === 'api') Object.assign(row, { [c('vaerdi')]: choice.value, [c('udbyder')]: choice.providerId, [c('forespoergsel')]: choice.request, [c('hentet')]: choice.fetchedAt })
  return row
}

function postingRow(p: Posting, m: ManualAction | undefined): Row {
  return {
    [c('importid')]: p.importId, [c('dato')]: s(p.date), [c('konto')]: s(p.account), [c('kontonavn')]: s(p.accountName),
    [c('leverandoer')]: s(p.supplier), [c('tekst')]: s(p.text), [c('beloeb')]: n(p.amount), [c('valuta')]: s(p.currency),
    [c('manuelhandling')]: m ? toChoice(c('postering'), c('manuelhandling'), m.type) : null,
    [c('manuelfaktor')]: m ? s(m.factorId) : null,
    [c('manuelkategori')]: m ? m.category : null,
    [c('manuelbegrundelse')]: m ? s(m.reason) : null,
  }
}

function ruleRow(company: string, r: Rule, order: number): Row {
  return {
    [COMPANY]: company, [c('navn')]: r.name, [c('raekkefoelge')]: order,
    [c('regeltype')]: toChoice(c('regel'), c('regeltype'), r.type), [c('aktiv')]: r.active,
    [c('betingelser')]: JSON.stringify(r.conditions), [c('faktorid')]: s(r.factorId), [c('kategori')]: r.category, [c('begrundelse')]: s(r.reason),
  }
}

/**
 * Rows back into a group. Records are ordered deterministically (Dataverse returns them in no
 * particular order): companies by name, lines and surveys by date, rules by their order column.
 * The view (active company, summary period) is passed in, since it isn't stored.
 */
export function fromRows(rows: Rows, view: { activeCompanyId?: string; summaryPeriod?: GroupData['summaryPeriod'] } = {}): GroupData {
  const all = (table: string) => [...(rows[table] ?? new Map<string, Row>()).entries()]
  const of = (table: string, company: string) => all(table).filter(([, r]) => r[COMPANY] === company)
  const byDate = <T extends { date: string; id: string }>(xs: T[]) => xs.sort((x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id))

  const companies: Company[] = all(c('virksomhed'))
    .map(([id, r]): Company => {
      const base = emptyAccount()
      const settings = rows[c('klimaregnskab')]?.get(id)
      const lines = (list: string) => byDate(of(c('linje'), id).filter(([, r]) => fromListValue(r[c('liste')]) === list).map(([key, r]) => lineFrom(list, key, r)))
      const imports = of(c('import'), id).map(([key, r]): ImportBatch => ({ id: key, fileName: str(r[c('filnavn')]), importedAt: str(r[c('importeret')]), count: num(r[c('antal')]) ?? 0 }))
      const importIds = new Set(imports.map((b) => b.id))
      const postingRows = all(c('postering')).filter(([, r]) => importIds.has(str(r[c('importid')])))
      const manual: Record<string, ManualAction> = {}
      for (const [key, r] of postingRows) {
        const type = fromChoice(c('postering'), c('manuelhandling'), r[c('manuelhandling')])
        if (type === 'tag' || type === 'exclude') manual[key] = { postingId: key, type, factorId: optStr(r[c('manuelfaktor')]) ?? null, category: num(r[c('manuelkategori')]), reason: str(r[c('manuelbegrundelse')]) }
      }
      const points = of(c('indekspunkt'), id)
      const account: AccountData = {
        ...base,
        version: ACCOUNT_VERSION,
        period: settings ? { start: str(settings[c('periodestart')]), end: str(settings[c('periodeslut')]) } : base.period,
        category3Params: {
          gridLoss: num(settings?.[c('nettab')] ?? null) ?? defaultCategory3Params(factors).gridLoss,
          wttRatio: num(settings?.[c('wttratio')] ?? null) ?? defaultCategory3Params(factors).wttRatio,
        },
        locations: of(c('lokation'), id).map(([key, r]): Location => ({
          id: key, name: str(r[c('navn')]), gridFamily: str(r[c('elnetfamilie')]),
          marketInstrument: fromChoice(c('lokation'), c('markedsinstrument'), r[c('markedsinstrument')]) as Location['marketInstrument'],
          heatingFactorId: str(r[c('fjernvarmefaktor')]) as Location['heatingFactorId'],
        })).sort((x, y) => x.name.localeCompare(y.name) || x.id.localeCompare(y.id)),
        scope1Lines: lines('scope1Lines') as Scope1Line[],
        scope2Lines: lines('scope2Lines') as Scope2Line[],
        cat1Lines: lines('cat1Lines') as SpendLine[],
        cat4Lines: lines('cat4Lines') as ActivityLine[],
        cat4SpendLines: lines('cat4SpendLines') as SpendLine[],
        cat5Lines: lines('cat5Lines') as ActivityLine[],
        cat6Lines: lines('cat6Lines') as ActivityLine[],
        surveys: byDate(of(c('pendling'), id).map(([key, r]): Survey => ({
          id: key, label: str(r[c('navn')]), date: str(r[c('dato')]), employees: num(r[c('medarbejdere')]),
          responses: num(r[c('besvarelser')]), workWeeksPerYear: num(r[c('arbejdsuger')]), modes: JSON.parse(str(r[c('svar')]) || '{}') as Survey['modes'],
        }))),
        investments: byDate(of(c('investering'), id).map(([key, r]) => investmentFrom(key, r))),
        factorSources: Object.fromEntries(of(c('faktorkilde'), id).map(([, r]) => [str(r[c('faktorid')]), factorSourceFrom(r)])),
        relevance: { ...defaultRelevance(), ...Object.fromEntries(of(c('relevans'), id).map(([, r]) => [num(r[c('kategori')]), { relevant: r[c('relevant')] === true, reason: str(r[c('begrundelse')]) }])) },
        deflation: {
          ...noDeflation,
          active: settings?.[c('indeksreguler')] === true,
          seriesId: optStr(settings?.[c('indeksserie')] ?? null) ?? null,
          series: defaultPriceIndexSeries.map((series) => ({
            ...series,
            points: points.filter(([, r]) => r[c('serie')] === series.id).map(([, r]) => ({ year: num(r[c('aar')]) ?? 0, value: num(r[c('vaerdi')]) ?? 0 })).sort((x, y) => x.year - y.year),
          })),
          factorSettings: Object.fromEntries(of(c('prisaar'), id).map(([, r]) => [str(r[c('faktorid')]), { baseYear: num(r[c('basisaar')]), seriesId: optStr(r[c('serie')]) ?? null }])),
        },
        ledger: {
          imports,
          postings: postingRows.map(([key, r]): Posting => ({
            id: key, importId: str(r[c('importid')]), date: str(r[c('dato')]), account: str(r[c('konto')]), accountName: str(r[c('kontonavn')]),
            supplier: str(r[c('leverandoer')]), text: str(r[c('tekst')]), amount: num(r[c('beloeb')]), currency: str(r[c('valuta')]),
          })).sort((x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id)),
          rules: of(c('regel'), id).sort(([, x], [, y]) => (num(x[c('raekkefoelge')]) ?? 0) - (num(y[c('raekkefoelge')]) ?? 0)).map(([key, r]): Rule => ({
            id: key, name: str(r[c('navn')]), type: fromChoice(c('regel'), c('regeltype'), r[c('regeltype')]) === 'exclude' ? 'exclude' : 'tag',
            active: r[c('aktiv')] === true, conditions: JSON.parse(str(r[c('betingelser')]) || '[]') as Rule['conditions'],
            factorId: optStr(r[c('faktorid')]) ?? null, category: num(r[c('kategori')]) ?? 1, reason: str(r[c('begrundelse')]),
          })),
          manual,
        },
      }
      return {
        id,
        name: str(r[c('navn')]),
        ownership: of(c('ejerandel'), id).map(([, o]) => ({ fromYear: num(o[c('fraaar')]) ?? 0, pct: num(o[c('procent')]) ?? 0 })).sort((x, y) => x.fromYear - y.fromYear),
        account,
      }
    })
    .sort((x, y) => x.name.localeCompare(y.name, 'da') || x.id.localeCompare(y.id))

  const first = companies[0]?.id ?? ''
  return {
    version: GROUP_VERSION,
    name: str(rows[c('koncern')]?.get(GROUP_KEY)?.[c('navn')] ?? null) || 'Koncernen',
    companies,
    activeCompanyId: companies.some((x) => x.id === view.activeCompanyId) ? view.activeCompanyId! : first,
    summaryPeriod: view.summaryPeriod ?? companies[0]?.account.period ?? emptyAccount().period,
  }
}

const fromListValue = (v: Value) => lineLists.find((l) => l.value === v)?.appValue ?? null

function lineFrom(list: string, id: string, r: Row): AnyLine {
  const common = { id, date: str(r[c('dato')]), ...(optStr(r[c('tildato')]) ? { dateTo: str(r[c('tildato')]) } : {}), ...(num(r[c('egenfaktor')]) !== null ? { customFactor: num(r[c('egenfaktor')]) } : {}), ...(optStr(r[c('beskrivelse')]) ? { description: str(r[c('beskrivelse')]) } : {}) }
  const factorId = optStr(r[c('faktorid')]) ? { factorId: str(r[c('faktorid')]) } : {}
  if (list === 'scope2Lines') {
    return { ...common, locationId: str(r[c('lokationid')]), kind: fromChoice(c('linje'), c('energiart'), r[c('energiart')]) as Scope2Line['kind'], kWh: num(r[c('maengde')]) }
  }
  if (list === 'cat1Lines' || list === 'cat4SpendLines') {
    return { ...common, ...factorId, group: str(r[c('gruppe')]), amount: num(r[c('beloeb')]), currency: str(r[c('valuta')]) } as SpendLine
  }
  return { ...common, ...factorId, group: str(r[c('gruppe')]), quantity: num(r[c('maengde')]) } as ActivityLine
}

function investmentFrom(id: string, r: Row): Investment {
  return {
    id, date: str(r[c('dato')]), company: str(r[c('selskab')]), ownershipPct: num(r[c('ejerandel')]),
    accountingMethod: (fromChoice(c('investering'), c('regnskabsmetode'), r[c('regnskabsmetode')]) ?? 'Ass.') as Investment['accountingMethod'],
    climateMethod: str(r[c('klimametode')]), dataSource: str(r[c('datakilde')]),
    basis: (fromChoice(c('investering'), c('grundlag'), r[c('grundlag')]) ?? 'CO2e') as Investment['basis'],
    totalKgCO2e: num(r[c('udledningkg')]), revenueDKK: num(r[c('omsaetningdkk')]), revenueLocal: num(r[c('omsaetninglokal')]),
    localCurrency: str(r[c('lokalvaluta')]), rateLocalToDKK: num(r[c('kurs')]), factorKgPerEUR: num(r[c('faktorpreur')]),
    factorSource: str(r[c('faktorkilde')]), country: str(r[c('land')]),
  }
}

function factorSourceFrom(r: Row): FactorSourceChoice {
  const kind = fromChoice(c('faktorkilde'), c('kildetype'), r[c('kildetype')])
  if (kind === 'publication') return { kind, publicationId: str(r[c('publikation')]) }
  if (kind === 'manual') return { kind, value: num(r[c('vaerdi')]) ?? 0, source: str(r[c('kildetekst')]), date: str(r[c('kildedato')]) }
  if (kind === 'api') return { kind, providerId: str(r[c('udbyder')]), value: num(r[c('vaerdi')]) ?? 0, fetchedAt: str(r[c('hentet')]), request: str(r[c('forespoergsel')]) }
  return { kind: 'builtin' }
}

export type Operation =
  | { kind: 'create'; table: string; key: string; row: Row }
  | { kind: 'update'; table: string; key: string; changes: Row }
  | { kind: 'delete'; table: string; key: string }

/** Parents before children when creating, children before parents when deleting. */
const ORDER = [c('koncern'), c('virksomhed'), c('ejerandel'), c('klimaregnskab'), c('lokation'), c('linje'), c('pendling'), c('investering'), c('faktorkilde'), c('relevans'), c('indekspunkt'), c('prisaar'), c('import'), c('postering'), c('regel')]

const same = (x: Value | undefined, y: Value | undefined) => (x ?? null) === (y ?? null)

/**
 * What to send to make `before` into `after`: creates, updates with only the changed columns
 * (ADR 0005: no false updates in the audit log), and deletes. Deleting a company or an import
 * deletes its records through the parental relationship, so those aren't sent separately.
 */
export function diff(before: Rows, after: Rows): Operation[] {
  const creates: Operation[] = []
  const updates: Operation[] = []
  const deletes: Operation[] = []
  for (const table of ORDER) {
    const b = before[table] ?? new Map<string, Row>()
    const a = after[table] ?? new Map<string, Row>()
    for (const [key, row] of a) {
      const old = b.get(key)
      if (!old) { creates.push({ kind: 'create', table, key, row }); continue }
      const changes: Row = {}
      for (const col of new Set([...Object.keys(row), ...Object.keys(old)])) if (!same(row[col], old[col])) changes[col] = row[col] ?? null
      if (Object.keys(changes).length) updates.push({ kind: 'update', table, key, changes })
    }
    for (const [key, row] of b) {
      if (a.has(key)) continue
      if (cascades(table, row, after)) continue
      deletes.push({ kind: 'delete', table, key })
    }
  }
  return [...creates, ...updates, ...deletes.reverse()]
}

/** Whether a row disappears anyway because its parent is deleted. */
function cascades(table: string, row: Row, after: Rows): boolean {
  if (table === c('postering')) return !after[c('import')]?.has(str(row[c('importid')]))
  if (table === c('virksomhed') || table === c('koncern')) return false
  const company = row[COMPANY]
  return typeof company === 'string' && !after[c('virksomhed')]?.has(company)
}
