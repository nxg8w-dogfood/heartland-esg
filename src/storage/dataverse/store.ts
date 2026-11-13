// The group stored in Dataverse (docs/adr/0005 section 7): loads every table, and saves only
// what changed, record by record and column by column, so auditing shows real changes only.
// One save runs at a time; within it, records of one table go a few at a time, within
// Dataverse's service protection limits (see SaveOptions).
// Dataverse checks every request against the user's security roles; what a user can't read
// simply isn't loaded, and a change they aren't allowed fails with Dataverse's message.
//
// The store talks to a small TableApi, so it's tested with a fake; generated.ts implements it
// with the Power Apps services generated for the hlesg_ tables.

import { tables, type Column } from '../../dataverse/schema'
import { schemaName } from '../../dataverse/metadata'
import { parseGroup, type GroupData, type GroupLoadResult } from '../group'
import type { GroupStore, SaveProgress } from '../store'
import { diff, emptyRows, fromRows, GROUP_KEY, migrateLegacyPeriods, naturalKey, toRows, type Operation, type Row, type Rows, type Value } from './rows'

/** A Dataverse record as the Web API returns or accepts it */
export type DvRecord = Record<string, unknown>

export type TableApi = {
  list(table: string): Promise<DvRecord[]>
  /** Returns the new record's id */
  create(table: string, record: DvRecord): Promise<string>
  update(table: string, id: string, changes: DvRecord): Promise<void>
  delete(table: string, id: string): Promise<void>
}

/** The user's own view, kept in this browser: which company is open, and which of its periods. */
export type ViewPrefs = {
  read(): { activeCompanyId?: string; activePeriodId?: string }
  write(view: { activeCompanyId: string; activePeriodId: string }): void
}

/** Tables whose rows carry the app's own id, used as the Dataverse primary key */
const APP_IDS = new Set(['virksomhed', 'regnskabsperiode', 'lokation', 'koeretoej', 'linje', 'pendling', 'investering', 'import', 'postering', 'regel'].map((t) => `hlesg_${t}`))

/** Dataverse's entity set names: the logical name plus "s" ("es" after an s), as created. */
export const entitySet = (table: string) => (table.endsWith('s') ? `${table}es` : `${table}s`)

const lookupsOf = (table: string) => tablesByName.get(table)!.columns.filter((c): c is Extract<Column, { kind: 'lookup' }> => c.kind === 'lookup')
const tablesByName = new Map(tables.map((t) => [t.name, t]))

/** The app's key for a row, from its own columns where the row has no app id. */
export function keyOf(table: string, id: string, row: Row): string {
  const company = String(row.hlesg_virksomhedid ?? '')
  switch (table) {
    case 'hlesg_koncern': return GROUP_KEY
    case 'hlesg_klimaregnskab': return company
    case 'hlesg_ejerandel': return naturalKey(company, Number(row.hlesg_fraaar))
    case 'hlesg_faktorkilde': return naturalKey(company, String(row.hlesg_faktorid))
    case 'hlesg_relevans': return naturalKey(company, Number(row.hlesg_kategori))
    case 'hlesg_indekspunkt': return naturalKey(company, String(row.hlesg_serie), Number(row.hlesg_aar))
    case 'hlesg_prisaar': return naturalKey(company, String(row.hlesg_faktorid))
    default: return id
  }
}

/** A Dataverse record as a row: the schema's columns only, lookups as the target's id. */
export function rowFromRecord(table: string, record: DvRecord): { id: string; key: string; row: Row } {
  const t = tablesByName.get(table)!
  const row: Row = {}
  const plain = (v: unknown): Value => (v === undefined ? null : (v as Value))
  row[t.primary.name] = plain(record[t.primary.name])
  for (const c of t.columns) {
    if (c.kind === 'lookup') row[c.name] = plain(record[`_${c.name}_value`])
    // Dataverse returns date and time without milliseconds; the app writes toISOString().
    else if (c.kind === 'datetime') row[c.name] = typeof record[c.name] === 'string' ? new Date(record[c.name] as string).toISOString() : null
    else row[c.name] = plain(record[c.name])
  }
  const id = String(record[`${table}id`])
  return { id, key: keyOf(table, id, row), row }
}

/** A row (or the changed columns of one) as a Web API body: lookups bound to their target. */
export function recordFromRow(table: string, row: Row, idOf: (table: string, key: string) => string | undefined): DvRecord {
  const out: DvRecord = {}
  const lookups = new Map(lookupsOf(table).map((l) => [l.name, l]))
  for (const [col, value] of Object.entries(row)) {
    const l = lookups.get(col)
    if (!l) { out[col] = value; continue }
    const target = value == null ? undefined : idOf(l.target, String(value))
    out[`${schemaName(l.name)}@odata.bind`] = target ? `/${entitySet(l.target)}(${target})` : null
  }
  return out
}

/**
 * How a save talks to Dataverse. A large import is thousands of records, one request each, and
 * Dataverse limits each user to about 6,000 requests per five minutes and 52 at a time
 * (service protection limits). So records of one table are sent a few at a time, and a
 * request Dataverse turns away for the limits is retried after a pause that grows.
 */
export type SaveOptions = { concurrency: number; retryDelayMs: number; maxRetryDelayMs: number; maxRetries: number }

export const defaultSaveOptions: SaveOptions = { concurrency: 8, retryDelayMs: 2_000, maxRetryDelayMs: 60_000, maxRetries: 30 }

/** Dataverse's answers when a user exceeds the service protection limits. */
export function isThrottled(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return /\b429\b|too many requests|number of requests exceeded|concurrent requests exceeded|combined execution time|0x80072321|0x80072322|0x80072326/i.test(m)
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Runs consecutive operations on the same table and of the same kind as one group. */
function groups(ops: Operation[]): Operation[][] {
  const out: Operation[][] = []
  for (const op of ops) {
    const last = out.at(-1)
    if (last && last[0].kind === op.kind && last[0].table === op.table) last.push(op)
    else out.push([op])
  }
  return out
}

export function dataverseStore(api: TableApi, prefs: ViewPrefs, options: Partial<SaveOptions> = {}): GroupStore {
  const opts = { ...defaultSaveOptions, ...options }
  let loaded: Rows = emptyRows()
  // Periods made from the old columns on load (ADR 0013), not in Dataverse until changed.
  let unsaved = new Set<string>()
  const PERIODS = 'hlesg_regnskabsperiode'
  const ids = new Map<string, Map<string, string>>()
  const idOf = (table: string, key: string) => ids.get(table)?.get(key) ?? (APP_IDS.has(table) ? key : undefined)

  /** One operation, retried while Dataverse says the user has sent too much. */
  async function applyWithRetry(op: Operation): Promise<void> {
    for (let attempt = 0, delay = opts.retryDelayMs; ; attempt++, delay = Math.min(delay * 2, opts.maxRetryDelayMs)) {
      try {
        return await apply(op)
      } catch (e) {
        if (!isThrottled(e) || attempt >= opts.maxRetries) throw e
        await sleep(delay)
      }
    }
  }

  /**
   * Sends one group's operations a few at a time. After a failure no more are started; the
   * ones under way finish and stay recorded, so the next save sends only what's left.
   */
  async function applyGroup(ops: Operation[], progress: () => void): Promise<void> {
    let next = 0
    let failure: { error: unknown } | null = null
    const worker = async () => {
      while (!failure && next < ops.length) {
        const op = ops[next++]
        try {
          await applyWithRetry(op)
          progress()
        } catch (error) {
          failure ??= { error }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(opts.concurrency, ops.length) }, worker))
    if (failure) throw (failure as { error: unknown }).error
  }

  async function saveNow(group: GroupData, onProgress?: SaveProgress): Promise<void> {
    prefs.write({ activeCompanyId: group.activeCompanyId, activePeriodId: group.activePeriodId })
    // Parents before children: each group of one table and kind finishes before the next starts.
    const ops = diff(loaded, toRows(group))
    let done = 0
    onProgress?.(0, ops.length)
    for (const g of groups(ops)) await applyGroup(g, () => onProgress?.(++done, ops.length))
  }

  // One save at a time: a change made during a long save waits, then only what's still
  // different is sent. Saves that queued meanwhile all send the latest group.
  let queue: Promise<void> = Promise.resolve()
  let latest: GroupData | null = null

  async function apply(op: Operation): Promise<void> {
    if (op.table === PERIODS && unsaved.has(op.key)) {
      unsaved.delete(op.key)
      // Deleting one that was never saved needs nothing sent; changing one creates it.
      if (op.kind === 'delete') { loaded[op.table].delete(op.key); return }
      if (op.kind === 'update') op = { kind: 'create', table: op.table, key: op.key, row: { ...loaded[op.table].get(op.key), ...op.changes } }
    }
    if (op.kind === 'create') {
      const body = recordFromRow(op.table, op.row, idOf)
      for (const [k, v] of Object.entries(body)) if (v === null) delete body[k]
      if (APP_IDS.has(op.table)) body[`${op.table}id`] = op.key
      const id = await api.create(op.table, body)
      if (!ids.has(op.table)) ids.set(op.table, new Map())
      ids.get(op.table)!.set(op.key, id)
      loaded[op.table].set(op.key, op.row)
      return
    }
    const id = idOf(op.table, op.key)
    if (!id) throw new Error(`Kender ikke Dataverse-id'et for ${op.table} ${op.key}.`)
    if (op.kind === 'update') {
      await api.update(op.table, id, recordFromRow(op.table, op.changes, idOf))
      loaded[op.table].set(op.key, { ...loaded[op.table].get(op.key), ...op.changes })
      return
    }
    await api.delete(op.table, id)
    forget(op.table, op.key)
  }

  /** Drop a deleted row, and the rows Dataverse deleted with it through a parental relationship. */
  function forget(table: string, key: string) {
    loaded[table].delete(key)
    ids.get(table)?.delete(key)
    for (const [child, rows] of Object.entries(loaded)) {
      for (const [k, row] of rows) {
        const parent = lookupsOf(child).find((l) => l.onDelete === 'Cascade' && l.target === table)
        if (parent && row[parent.name] === key) forget(child, k)
      }
    }
  }

  return {
    label: 'Dataverse',
    central: true,
    async load(): Promise<GroupLoadResult | null> {
      const rows = emptyRows()
      ids.clear()
      for (const t of tables) {
        const map = new Map<string, string>()
        for (const record of await api.list(t.name)) {
          const { id, key, row } = rowFromRecord(t.name, record)
          rows[t.name].set(key, row)
          map.set(key, id)
        }
        ids.set(t.name, map)
      }
      unsaved = migrateLegacyPeriods(rows)
      loaded = rows
      const group = fromRows(rows, prefs.read())
      // Nothing stored yet, or nothing this user may read: an empty group, which the app explains.
      if (group.companies.length === 0) return { ok: true, group, dropped: 0, notes: [] }
      // Validate like any loaded data, so a record the app can't use is dropped and counted.
      return parseGroup(JSON.parse(JSON.stringify(group)))
    },
    save(group: GroupData, onProgress?: SaveProgress): Promise<void> {
      latest = group
      const run = queue.catch(() => {}).then(() => saveNow(latest!, onProgress))
      queue = run
      return run
    },
  }
}
