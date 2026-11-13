import { describe, expect, it } from 'vitest'
import { tables } from '../../dataverse/schema'
import { emptyAccount } from '../account'
import { GROUP_VERSION, type GroupData } from '../group'
import { dataverseStore, entitySet, isThrottled, type DvRecord, type TableApi, type ViewPrefs } from './store'

/**
 * Dataverse in memory, close enough for the store: records by id, a generated id when none is
 * given, lookups from @odata.bind returned as _<lookup>_value, parental cascade deletes, and
 * date-and-time values returned without milliseconds, as Dataverse does.
 */
function fakeDataverse(opts: { failOn?: (call: string, table: string) => boolean } = {}) {
  const db = new Map<string, Map<string, DvRecord>>(tables.map((t) => [t.name, new Map()]))
  const calls: { op: string; table: string; id?: string; body?: DvRecord }[] = []
  let generated = 0
  const lookupOf = (table: string, schemaBind: string) => tables.find((t) => t.name === table)!.columns.find((c) => c.kind === 'lookup' && `${c.name}` === schemaBind.toLowerCase())

  function store(table: string, id: string, body: DvRecord, merge: DvRecord = {}) {
    const rec: DvRecord = { ...merge }
    for (const [k, v] of Object.entries(body)) {
      const m = k.match(/^(.+)@odata\.bind$/)
      if (m) {
        const l = lookupOf(table, m[1])!
        rec[`_${l.name}_value`] = v === null ? null : String(v).match(/\(([^)]+)\)$/)![1]
      } else if (k === 'hlesg_importeret' && typeof v === 'string') rec[k] = v.replace(/\.\d{3}Z$/, 'Z')
      else rec[k] = v
    }
    rec[`${table}id`] = id
    db.get(table)!.set(id, rec)
  }

  function cascade(table: string, id: string) {
    db.get(table)!.delete(id)
    for (const t of tables) {
      for (const l of t.columns) {
        if (l.kind !== 'lookup' || l.target !== table || l.onDelete !== 'Cascade') continue
        for (const [childId, rec] of db.get(t.name)!) if (rec[`_${l.name}_value`] === id) cascade(t.name, childId)
      }
    }
  }

  const api: TableApi = {
    async list(table) { calls.push({ op: 'list', table }); return [...db.get(table)!.values()].map((r) => ({ ...r })) },
    async create(table, body) {
      calls.push({ op: 'create', table, body })
      if (opts.failOn?.('create', table)) throw new Error(`denied: create ${table}`)
      const id = (body[`${table}id`] as string | undefined) ?? `dv-${++generated}`
      if (db.get(table)!.has(id)) throw new Error(`duplicate ${table} ${id}`)
      store(table, id, Object.fromEntries(Object.entries(body).filter(([k]) => k !== `${table}id`)))
      return id
    },
    async update(table, id, changes) {
      calls.push({ op: 'update', table, id, body: changes })
      if (opts.failOn?.('update', table)) throw new Error(`denied: update ${table}`)
      const old = db.get(table)!.get(id)
      if (!old) throw new Error(`no ${table} ${id}`)
      store(table, id, changes, old)
    },
    async delete(table, id) {
      calls.push({ op: 'delete', table, id })
      if (!db.get(table)!.has(id)) throw new Error(`no ${table} ${id}`)
      cascade(table, id)
    },
  }
  return { api, db, calls, writes: () => calls.filter((c) => c.op !== 'list') }
}

function memoryPrefs(): ViewPrefs {
  let view: ReturnType<ViewPrefs['read']> = {}
  return { read: () => view, write: (v) => { view = v } }
}

function sample(): GroupData {
  const a = emptyAccount()
  return {
    version: GROUP_VERSION,
    name: 'Heartland',
    activeCompanyId: 'c-1',
    activePeriodId: 'per-25',
    companies: [{
      id: 'c-1', name: 'Heartland A/S', ownership: [{ fromYear: 2000, pct: 100 }],
      account: {
        ...a,
        periods: [{ id: 'per-25', name: '2025', start: '2025-01-01', end: '2025-12-31' }],
        locations: [{ ...a.locations[0], id: 'loc-1' }],
        scope1Lines: [{ id: 's1-a', group: 's1-diesel', date: '2025-02-01', quantity: 100 }],
        scope2Lines: [{ id: 's2-a', locationId: 'loc-1', kind: 'electricity', date: '2025-01-01', kWh: 1000 }],
        factorSources: { 'f-s2-fjernvarme-lokal': { kind: 'manual', value: 0.08, source: 'HOFOR', date: '2026-03-01' } },
        ledger: {
          imports: [{ id: 'imp-a', fileName: 'kontoplan.csv', importedAt: '2026-02-01T09:00:00.000Z', count: 1 }],
          postings: [{ id: 'p-a', importId: 'imp-a', date: '2025-03-31', account: '6100', accountName: 'Revision', supplier: 'Deloitte', text: 'Faktura', amount: 1000, currency: 'DKK' }],
          rules: [], manual: {},
        },
      },
    }],
  }
}

async function saved(group = sample()) {
  const fake = fakeDataverse()
  const store = dataverseStore(fake.api, memoryPrefs())
  await store.load()
  await store.save(group)
  return { fake, store }
}

describe('the Dataverse store', () => {
  it('saves a group and loads it back unchanged, from a fresh store', async () => {
    const { fake } = await saved()
    const prefs = memoryPrefs()
    prefs.write({ activeCompanyId: 'c-1', activePeriodId: 'per-25' })
    const loaded = await dataverseStore(fake.api, prefs).load()
    expect(loaded).toEqual({ ok: true, group: sample(), dropped: 0, notes: [] })
  })

  it('uses the app’s ids as primary keys, and binds lookups to them', async () => {
    const { fake } = await saved()
    const line = fake.writes().find((c) => c.op === 'create' && c.table === 'hlesg_linje' && c.body?.hlesg_linjeid === 's2-a')!
    expect(line.body).toMatchObject({
      'hlesg_Virksomhedid@odata.bind': '/hlesg_virksomheds(c-1)',
      'hlesg_Lokationid@odata.bind': '/hlesg_lokations(loc-1)',
    })
    const posting = fake.writes().find((c) => c.op === 'create' && c.table === 'hlesg_postering')!
    expect(posting.body).toMatchObject({ hlesg_posteringid: 'p-a', 'hlesg_Importid@odata.bind': '/hlesg_imports(imp-a)' })
  })

  it('leaves out empty columns when creating', async () => {
    const { fake } = await saved()
    const line = fake.writes().find((c) => c.op === 'create' && c.body?.hlesg_linjeid === 's1-a')!
    expect(Object.values(line.body!)).not.toContain(null)
  })

  it('sends nothing when nothing changed, including dates and times Dataverse returns without milliseconds', async () => {
    const { fake } = await saved()
    const store = dataverseStore(fake.api, memoryPrefs())
    const loaded = await store.load()
    const before = fake.writes().length
    await store.save(loaded?.ok ? loaded.group : sample())
    expect(fake.writes().length).toBe(before)
  })

  it('sends one update with one column for one changed value', async () => {
    const { fake, store } = await saved()
    const g = sample()
    g.companies[0].account.scope1Lines[0].quantity = 150
    const before = fake.writes().length
    await store.save(g)
    expect(fake.writes().slice(before)).toEqual([{ op: 'update', table: 'hlesg_linje', id: 's1-a', body: { hlesg_maengde: 150 } }])
  })

  it('updates rows without an app id under the id Dataverse gave them', async () => {
    const { fake, store } = await saved()
    const id = [...fake.db.get('hlesg_faktorkilde')!.keys()][0]
    expect(id).toMatch(/^dv-/)
    const g = sample()
    g.companies[0].account.factorSources['f-s2-fjernvarme-lokal'] = { kind: 'manual', value: 0.09, source: 'HOFOR', date: '2026-03-01' }
    const before = fake.writes().length
    await store.save(g)
    expect(fake.writes().slice(before)).toEqual([{ op: 'update', table: 'hlesg_faktorkilde', id, body: { hlesg_vaerdi: 0.09 } }])
  })

  it('deletes a company with one request, and Dataverse removes its records', async () => {
    const two = sample()
    two.companies.push({ ...sample().companies[0], id: 'c-2', name: 'Datter ApS', account: emptyAccount() })
    const { fake, store } = await saved(two)
    const before = fake.writes().length
    await store.save(sample())
    expect(fake.writes().slice(before)).toEqual([{ op: 'delete', table: 'hlesg_virksomhed', id: 'c-2' }])
    expect([...fake.db.get('hlesg_relevans')!.values()].every((r) => r._hlesg_virksomhedid_value === 'c-1')).toBe(true)
    // And it doesn't try to delete the gone records on the next save.
    await store.save(sample())
    expect(fake.writes().length).toBe(before + 1)
  })

  it('recreates a deleted company’s records when it comes back, e.g. from a backup', async () => {
    const two = sample()
    two.companies.push({ ...sample().companies[0], id: 'c-2', name: 'Datter ApS', account: { ...emptyAccount(), scope1Lines: [{ id: 's1-x', group: 's1-diesel', date: '2025-05-01', quantity: 7 }] } })
    const { fake, store } = await saved(two)
    await store.save(sample())
    const before = fake.writes().length
    await store.save(two)
    const after = fake.writes().slice(before)
    expect(after.every((c) => c.op === 'create')).toBe(true)
    expect(after.some((c) => c.table === 'hlesg_linje' && c.body?.hlesg_linjeid === 's1-x')).toBe(true)
    expect(fake.db.get('hlesg_linje')!.has('s1-x')).toBe(true)
  })

  it('picks up where it stopped after a failed save, without creating anything twice', async () => {
    let fail = true
    const fake = fakeDataverse({ failOn: (op, table) => fail && op === 'create' && table === 'hlesg_linje' })
    const store = dataverseStore(fake.api, memoryPrefs())
    await store.load()
    await expect(store.save(sample())).rejects.toThrow('denied: create hlesg_linje')
    fail = false
    await store.save(sample())
    // Lines are sent in parallel, so both may fail the first time; each is saved once in the end.
    const lines = fake.calls.filter((c) => c.op === 'create' && c.table === 'hlesg_linje')
    expect(lines.length).toBeLessThanOrEqual(4)
    expect(fake.db.get('hlesg_linje')!.size).toBe(2)
    expect(fake.db.get('hlesg_virksomhed')!.size).toBe(1)
    expect(fake.calls.filter((c) => c.op === 'create' && c.table === 'hlesg_virksomhed').length).toBe(1)
  })

  it('loads only what the user may read, and starts empty with nothing', async () => {
    const fake = fakeDataverse()
    const result = await dataverseStore(fake.api, memoryPrefs()).load()
    expect(result).toMatchObject({ ok: true, group: { companies: [] } })
  })

  it('remembers the open company and period in the user’s view, not in Dataverse', async () => {
    const prefs = memoryPrefs()
    const fake = fakeDataverse()
    const store = dataverseStore(fake.api, prefs)
    await store.load()
    const g = sample()
    g.companies[0].account.periods.push({ id: 'per-26', name: '2026', start: '2026-01-01', end: '2026-12-31' })
    await store.save({ ...g, activePeriodId: 'per-26' })
    expect(prefs.read()).toEqual({ activeCompanyId: 'c-1', activePeriodId: 'per-26' })
    const loaded = await dataverseStore(fake.api, prefs).load()
    expect(loaded?.ok && loaded.group.activePeriodId).toBe('per-26')
  })

  describe('a company saved before periods (ADR 0013)', () => {
    /** Dataverse as the previous version left it: the range on hlesg_klimaregnskab, no period rows. */
    async function legacy(opts: Parameters<typeof fakeDataverse>[0] = {}) {
      const { fake } = await saved()
      fake.db.get('hlesg_regnskabsperiode')!.clear()
      Object.assign(fake.db.get('hlesg_klimaregnskab')!.values().next().value!, { hlesg_periodestart: '2024-07-01', hlesg_periodeslut: '2025-06-30' })
      // The same records, behind an API that refuses some writes, like a user's security role.
      const refuse = (op: string, t: string) => { if (opts.failOn?.(op, t)) throw new Error(`denied: ${op} ${t}`) }
      const api: TableApi = {
        list: fake.api.list,
        create: async (t, body) => { refuse('create', t); return fake.api.create(t, body) },
        update: async (t, id, changes) => { refuse('update', t); return fake.api.update(t, id, changes) },
        delete: async (t, id) => { refuse('delete', t); return fake.api.delete(t, id) },
      }
      const s = dataverseStore(api, memoryPrefs())
      const r = await s.load()
      fake.calls.length = 0
      return { fake, store: s, group: r!.ok ? r!.group : sample() }
    }

    it('opens with the old range as its period', async () => {
      const { group } = await legacy()
      expect(group.companies[0].account.periods).toEqual([{ id: 'c-1', name: '2024/25', start: '2024-07-01', end: '2025-06-30' }])
      expect(group.activePeriodId).toBe('c-1')
    })

    it('saves lines for a user who may not write periods or settings, without touching either', async () => {
      const deny = (_: string, t: string) => t === 'hlesg_regnskabsperiode' || t === 'hlesg_klimaregnskab'
      const { fake, store, group } = await legacy({ failOn: deny })
      const a = group.companies[0].account
      await store.save({ ...group, companies: [{ ...group.companies[0], account: { ...a, scope1Lines: [...a.scope1Lines, { id: 's1-b', group: 's1-diesel', date: '2025-03-01', quantity: 5 }] } }] })
      expect(fake.writes().map((c) => `${c.op} ${c.table}`)).toEqual(['create hlesg_linje'])
    })

    it('creates the period in Dataverse when it’s changed, and never writes the old columns', async () => {
      const { fake, store, group } = await legacy()
      const a = group.companies[0].account
      await store.save({ ...group, companies: [{ ...group.companies[0], account: { ...a, periods: [{ ...a.periods[0], name: 'Regnskabsår 2024/25' }] } }] })
      expect(fake.writes()).toEqual([{ op: 'create', table: 'hlesg_regnskabsperiode', body: {
        hlesg_regnskabsperiodeid: 'c-1', 'hlesg_Virksomhedid@odata.bind': '/hlesg_virksomheds(c-1)',
        hlesg_navn: 'Regnskabsår 2024/25', hlesg_startdato: '2024-07-01', hlesg_slutdato: '2025-06-30',
      } }])
      // Saved once, it's an ordinary row: the next change is an update.
      await store.save({ ...group, companies: [{ ...group.companies[0], account: { ...a, periods: [{ ...a.periods[0], name: '2024/25 igen' }] } }] })
      expect(fake.writes().at(-1)).toMatchObject({ op: 'update', table: 'hlesg_regnskabsperiode', id: 'c-1' })
    })

    it('sends nothing to delete a period that was never saved', async () => {
      const { fake, store, group } = await legacy()
      const a = group.companies[0].account
      const other = { id: 'per-new', name: '2025/26', start: '2025-07-01', end: '2026-06-30' }
      await store.save({ ...group, companies: [{ ...group.companies[0], account: { ...a, periods: [other] } }] })
      expect(fake.writes().map((c) => `${c.op} ${c.table} ${c.body?.hlesg_regnskabsperiodeid ?? c.id ?? ''}`.trim())).toEqual(['create hlesg_regnskabsperiode per-new'])
    })
  })

  describe('a large import', () => {
    /** The sample with `n` postings in its import */
    function withPostings(n: number, group = sample()): GroupData {
      const ledger = group.companies[0].account.ledger
      ledger.imports[0].count = n
      ledger.postings = Array.from({ length: n }, (_, i) => ({ ...ledger.postings[0], id: `p-${i}`, text: `Faktura ${i}` }))
      return group
    }

    /** The fake, with each request taking a moment, counting how many run at once */
    function slow(api: TableApi) {
      let now = 0
      const stats = { max: 0 }
      const wrap = <A extends unknown[], R>(f: (...a: A) => Promise<R>) => async (...a: A) => {
        stats.max = Math.max(stats.max, ++now)
        try {
          await new Promise((r) => setTimeout(r, 1))
          return await f(...a)
        } finally {
          now--
        }
      }
      return { api: { list: api.list, create: wrap(api.create), update: wrap(api.update), delete: wrap(api.delete) } as TableApi, stats }
    }

    it('sends records a few at a time, and reports progress', async () => {
      const fake = fakeDataverse()
      const { api, stats } = slow(fake.api)
      const store = dataverseStore(api, memoryPrefs(), { concurrency: 4 })
      await store.load()
      const progress: [number, number][] = []
      await store.save(withPostings(200), (done, total) => progress.push([done, total]))
      expect(fake.db.get('hlesg_postering')!.size).toBe(200)
      expect(stats.max).toBe(4)
      expect(progress[0]).toEqual([0, progress.at(-1)![1]])
      expect(progress.at(-1)![0]).toBe(progress.at(-1)![1])
      expect(progress.at(-1)![1]).toBeGreaterThan(200)
    })

    it('waits and retries when Dataverse says too many requests, creating each record once', async () => {
      let refused = 0
      const fake = fakeDataverse({ failOn: (op, table) => op === 'create' && table === 'hlesg_postering' && refused++ % 7 === 3 })
      const inner = fake.api.create
      fake.api.create = async (table, body) => {
        try {
          return await inner(table, body)
        } catch (e) {
          throw new Error(`Kunne ikke oprette i ${table}: Number of requests exceeded the limit of 6000 over time window of 300 seconds. (${(e as Error).message})`, { cause: e })
        }
      }
      const store = dataverseStore(fake.api, memoryPrefs(), { retryDelayMs: 1, maxRetryDelayMs: 4 })
      await store.load()
      await store.save(withPostings(100))
      expect(fake.db.get('hlesg_postering')!.size).toBe(100)
      expect(refused).toBeGreaterThan(100)
    })

    it('doesn\'t retry what Dataverse refuses for another reason', async () => {
      const fake = fakeDataverse({ failOn: (op, table) => op === 'create' && table === 'hlesg_postering' })
      const store = dataverseStore(fake.api, memoryPrefs(), { retryDelayMs: 1 })
      await store.load()
      await expect(store.save(withPostings(20))).rejects.toThrow('denied: create hlesg_postering')
      expect(fake.calls.filter((c) => c.op === 'create' && c.table === 'hlesg_postering').length).toBeLessThanOrEqual(8)
    })

    it('runs one save at a time: a change during a long save is sent after it, without duplicates', async () => {
      const fake = fakeDataverse()
      const { api } = slow(fake.api)
      const store = dataverseStore(api, memoryPrefs())
      await store.load()
      const first = store.save(withPostings(100))
      const changed = withPostings(100)
      changed.companies[0].account.ledger.postings[0].text = 'Rettet'
      const second = store.save(changed)
      await Promise.all([first, second])
      expect(fake.db.get('hlesg_postering')!.size).toBe(100)
      expect(fake.calls.filter((c) => c.op === 'create' && c.table === 'hlesg_postering').length).toBe(100)
      expect(fake.db.get('hlesg_postering')!.get('p-0')!.hlesg_tekst).toBe('Rettet')
    })
  })

  it('recognises Dataverse\'s service protection errors', () => {
    expect(isThrottled(new Error('Number of concurrent requests exceeded the limit of 52.'))).toBe(true)
    expect(isThrottled(new Error('Combined execution time of incoming requests exceeded limit of 1,200,000 milliseconds'))).toBe(true)
    expect(isThrottled(new Error('Request failed with status 429'))).toBe(true)
    expect(isThrottled(new Error("The length of the 'hlesg_valuta' attribute exceeded the maximum allowed length of '3'."))).toBe(false)
  })

  it('names entity sets the way Dataverse created them', () => {
    expect(entitySet('hlesg_linje')).toBe('hlesg_linjes')
    expect(entitySet('hlesg_relevans')).toBe('hlesg_relevanses')
  })
})
