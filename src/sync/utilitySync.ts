// The nightly sync's work, without Azure (ADR 0021): for each company with a token in Key Vault,
// fetch its meters, record the ones it hasn't seen, and import new months for the meters that
// have a location. The Function (functions/utility-sync) supplies Dataverse, Key Vault, the
// clock and fetch; tests supply fakes.
//
// It uses the same fetch (fetchMeters) and the same duplicate check (planImport) as the app's
// manual fetch, so a month fetched by hand isn't imported again, and the other way round.

import type { Scope2Kind } from '../calc/scope2'
import { schemaName } from '../dataverse/metadata'
import { lineLists, tables, type Choice, type Column } from '../dataverse/schema'
import { entitySet } from '../storage/dataverse/store'
import { fetchMeters, type FetchedMeter, type MeterSource } from '../utility/fetchMeters'
import type { Fetch } from '../utility/http'
import { meterKey } from '../utility/meters'
import { completedMonths, copenhagenLocal, type Month } from '../utility/months'
import { planImport } from '../utility/toLines'

export type Json = Record<string, unknown>

/** The Dataverse Web API, as the sync needs it. Paths are relative to /api/data/v9.2/. */
export type DataverseApi = {
  /** Every row of a query, following paging; lookup owners carry their table in an annotation */
  list(path: string): Promise<Json[]>
  create(entitySet: string, record: Json): Promise<void>
  update(entitySet: string, id: string, changes: Json): Promise<void>
}

export type SyncDeps = {
  dataverse: DataverseApi
  /** A Key Vault secret's current value, or null when it doesn't exist */
  secret(name: string): Promise<string | null>
  fetch: Fetch
  now(): number
  newId(): string
  log(message: string): void
}

export type CompanyResult = {
  company: string
  meters: number
  newMeters: number
  lines: number
  /** Meters with no location yet, so nothing was imported for them */
  waiting: number
  problems: string[]
}

/** How many completed months each run fetches: enough for last year's report (ADR 0021). */
export const MONTHS_BACK = 13

/** Key Vault secret names for a company's tokens. Secret names allow letters, digits and dashes. */
export const secretName = (service: MeterSource, companyId: string) => `${service}-${companyId}`

const c = (s: string) => `hlesg_${s}`
const OWNER_TYPE = '_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname'

function options(table: string, column: string): readonly Choice[] {
  const col = tables.find((t) => t.name === table)?.columns.find((x) => x.name === column) as Extract<Column, { kind: 'choice' }> | undefined
  if (!col) throw new Error(`No choice column ${table}.${column}`)
  return col.options
}
const choice = (table: string, column: string, app: string) => options(table, column).find((o) => o.appValue === app)!.value
const fromChoice = (table: string, column: string, value: unknown) => options(table, column).find((o) => o.value === value)?.appValue ?? null
const SCOPE2 = lineLists.find((l) => l.appValue === 'scope2Lines')!.value

const bind = (lookup: string, target: string, id: string) => ({ [`${schemaName(lookup)}@odata.bind`]: `/${entitySet(target)}(${id})` })

/** The last `count` months that have ended, in Danish local time. */
export function lastCompletedMonths(count: number, nowMs: number): Month[] {
  const [y, m] = copenhagenLocal(nowMs).split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1 - count, 1)).toISOString().slice(0, 10)
  const end = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10)
  return completedMonths({ start, end }, nowMs).slice(-count)
}

type MeterRecord = { id: string; service: MeterSource; meterId: string; locationId: string | null; address: string; municipalityCode: string | null }

export async function syncCompany(deps: SyncDeps, company: Json, months: readonly Month[]): Promise<CompanyResult | null> {
  const companyId = String(company[c('virksomhedid')])
  const name = String(company[c('navn')] ?? companyId)
  const [eloverblik, varmeoverblik] = await Promise.all([deps.secret(secretName('eloverblik', companyId)), deps.secret(secretName('varmeoverblik', companyId))])
  if (!eloverblik && !varmeoverblik) return null

  // New records belong to whoever owns the company (its owner team, ADR 0006), so its users see them.
  const ownerTable = company[OWNER_TYPE] === 'systemuser' ? 'systemusers' : 'teams'
  const owner = { 'ownerid@odata.bind': `/${ownerTable}(${String(company._ownerid_value)})` }
  const ofCompany = `_${c('virksomhedid')}_value eq ${companyId}`

  const fetched = await fetchMeters(deps.fetch, { eloverblik, varmeoverblik }, months)
  const meterRows = await deps.dataverse.list(`${entitySet(c('maaler'))}?$select=${c('maalerid')},${c('kilde')},${c('maalernummer')},${c('adresse')},${c('kommunekode')},_${c('lokationid')}_value&$filter=${ofCompany}`)
  const known = new Map<string, MeterRecord>()
  for (const r of meterRows) {
    const service = fromChoice(c('maaler'), c('kilde'), r[c('kilde')]) as MeterSource | null
    if (!service) continue
    const m: MeterRecord = {
      id: String(r[c('maalerid')]), service, meterId: String(r[c('maalernummer')]),
      locationId: (r[`_${c('lokationid')}_value`] as string | null) ?? null,
      address: String(r[c('adresse')] ?? ''), municipalityCode: (r[c('kommunekode')] as string | null) ?? null,
    }
    known.set(meterKey(m), m)
  }
  const lineRows = await deps.dataverse.list(`${entitySet(c('linje'))}?$select=${c('dato')},${c('tildato')},${c('beskrivelse')},${c('energiart')},_${c('lokationid')}_value&$filter=${ofCompany} and ${c('liste')} eq ${SCOPE2}`)
  const existing = lineRows.map((r) => ({
    locationId: String(r[`_${c('lokationid')}_value`] ?? ''),
    kind: fromChoice(c('linje'), c('energiart'), r[c('energiart')]) as Scope2Kind,
    date: String(r[c('dato')] ?? ''),
    dateTo: (r[c('tildato')] as string | null) ?? undefined,
    description: (r[c('beskrivelse')] as string | null) ?? undefined,
  }))

  const result: CompanyResult = { company: name, meters: fetched.meters.length, newMeters: 0, lines: 0, waiting: 0, problems: [...fetched.problems] }
  const fetchedAt = new Date(deps.now()).toISOString()
  // A service that failed as a whole (a rejected token) is reported on each of its known meters.
  const failed = new Map<MeterSource, string>()
  if (eloverblik && fetched.problems.length && !fetched.meters.some((m) => m.service === 'eloverblik')) failed.set('eloverblik', fetched.problems.join(' '))
  if (varmeoverblik && fetched.problems.length && !fetched.meters.some((m) => m.service === 'varmeoverblik')) failed.set('varmeoverblik', fetched.problems.join(' '))

  for (const m of fetched.meters) {
    let record = known.get(m.key)
    // A new meter has no location yet: recording it, with this run's time and error, is all.
    if (!record) {
      record = { id: deps.newId(), service: m.service, meterId: m.meterId, locationId: null, address: m.address, municipalityCode: m.municipalityCode }
      await deps.dataverse.create(entitySet(c('maaler')), {
        [c('maalerid')]: record.id,
        [c('adresse')]: m.address,
        [c('kilde')]: choice(c('maaler'), c('kilde'), m.service),
        [c('maalernummer')]: m.meterId,
        [c('kommunekode')]: m.municipalityCode,
        [c('sidsthentet')]: fetchedAt,
        [c('fejl')]: m.error,
        ...bind(c('virksomhedid'), c('virksomhed'), companyId),
        ...owner,
      })
      known.set(m.key, record)
      result.newMeters++
      result.waiting++
      continue
    }
    let error = m.error
    if (record.locationId) {
      const created = await importMonths(deps, m, record.locationId, existing, companyId, owner)
      result.lines += created.count
      if (created.skipped.length) error = [error, `Ikke importeret: ${created.skipped.join('; ')}.`].filter(Boolean).join(' ')
    } else {
      result.waiting++
    }
    await deps.dataverse.update(entitySet(c('maaler')), record.id, {
      [c('sidsthentet')]: fetchedAt,
      [c('fejl')]: error,
      ...(record.address !== m.address ? { [c('adresse')]: m.address } : {}),
      ...(m.municipalityCode && record.municipalityCode !== m.municipalityCode ? { [c('kommunekode')]: m.municipalityCode } : {}),
    })
  }
  for (const [service, message] of failed) {
    for (const record of known.values()) {
      if (record.service === service) await deps.dataverse.update(entitySet(c('maaler')), record.id, { [c('fejl')]: message })
    }
  }
  deps.log(`${name}: ${result.meters} målere (${result.newMeters} nye, ${result.waiting} uden lokation), ${result.lines} nye linjer${result.problems.length ? `; ${result.problems.join(' ')}` : ''}`)
  return result
}

async function importMonths(
  deps: SyncDeps,
  meter: FetchedMeter,
  locationId: string,
  existing: Parameters<typeof planImport>[0][number][],
  companyId: string,
  owner: Json,
): Promise<{ count: number; skipped: string[] }> {
  const plan = planImport(existing, locationId, meter.kind, meter.source, meter.months)
  for (const line of plan.lines) {
    await deps.dataverse.create(entitySet(c('linje')), {
      [c('linjeid')]: deps.newId(),
      [c('liste')]: SCOPE2,
      [c('dato')]: line.date,
      [c('tildato')]: line.dateTo ?? null,
      [c('maengde')]: line.kWh,
      [c('beskrivelse')]: line.description ?? null,
      [c('energiart')]: choice(c('linje'), c('energiart'), line.kind),
      ...bind(c('lokationid'), c('lokation'), locationId),
      ...bind(c('virksomhedid'), c('virksomhed'), companyId),
      ...owner,
    })
    // Later meters at the same location see this month as taken, as in the app.
    existing.push(line)
  }
  return { count: plan.lines.length, skipped: plan.skipped.map((s) => `${s.month}: ${s.reason}`) }
}

/** One run over every company. A company that fails is reported; the others carry on. */
export async function syncAll(deps: SyncDeps): Promise<{ results: CompanyResult[]; failures: string[] }> {
  const months = lastCompletedMonths(MONTHS_BACK, deps.now())
  const companies = await deps.dataverse.list(`${entitySet(c('virksomhed'))}?$select=${c('virksomhedid')},${c('navn')},_ownerid_value`)
  const results: CompanyResult[] = []
  const failures: string[] = []
  for (const company of companies) {
    try {
      const r = await syncCompany(deps, company, months)
      if (r) results.push(r)
    } catch (err) {
      const message = `${String(company[c('navn')] ?? company[c('virksomhedid')])}: ${err instanceof Error ? err.message : String(err)}`
      failures.push(message)
      deps.log(message)
    }
  }
  return { results, failures }
}
