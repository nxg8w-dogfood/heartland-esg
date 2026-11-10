import { describe, expect, it } from 'vitest'
import { marketInstruments } from '../calc/scope2'
import { emptyAccount } from '../storage/account'
import { attribute, entity, relationship, relationshipName, schemaName } from './metadata'
import { accountStorage, lineLists, PUBLISHER, tables, type Column } from './schema'

const lookups = (cols: readonly Column[]) => cols.filter((c): c is Extract<Column, { kind: 'lookup' }> => c.kind === 'lookup')
const allColumns = tables.flatMap((t) => [{ ...t.primary, kind: 'text' as const, table: t.name }, ...t.columns.map((c) => ({ ...c, table: t.name }))])

describe('schema names', () => {
  it('are lowercase, prefixed with hlesg_, and within Dataverse’s 50-character limit', () => {
    for (const name of [...tables.map((t) => t.name), ...allColumns.map((c) => c.name)]) {
      expect(name, name).toMatch(/^hlesg_[a-z0-9]+$/)
      expect(name.length, name).toBeLessThanOrEqual(50)
    }
  })

  it('are unique: tables, and columns within each table', () => {
    expect(new Set(tables.map((t) => t.name)).size).toBe(tables.length)
    for (const t of tables) {
      const names = [t.primary.name, ...t.columns.map((c) => c.name)]
      expect(new Set(names).size, t.name).toBe(names.length)
      // Dataverse names the primary key <table>id itself.
      expect(names, t.name).not.toContain(`${t.name}id`)
    }
  })

  it('give each relationship a unique name', () => {
    const names = tables.flatMap((t) => lookups(t.columns).map((c) => relationshipName(c, t.name)))
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('lookups', () => {
  it('point to tables in the schema', () => {
    for (const t of tables) for (const c of lookups(t.columns)) expect(tables.map((x) => x.name), `${t.name}.${c.name}`).toContain(c.target)
  })

  it('give each table at most one parent, as Dataverse requires', () => {
    for (const t of tables) expect(lookups(t.columns).filter((c) => c.onDelete === 'Cascade').length, t.name).toBeLessThanOrEqual(1)
  })

  it('reach the company from every table, so deleting a company removes all its data', () => {
    const parentOf = (name: string) => lookups(tables.find((t) => t.name === name)!.columns).find((c) => c.onDelete === 'Cascade')?.target
    for (const t of tables.filter((x) => !['hlesg_koncern', 'hlesg_virksomhed'].includes(x.name))) {
      let at: string | undefined = t.name
      for (let i = 0; at && at !== 'hlesg_virksomhed' && i < 5; i++) at = parentOf(at)
      expect(at, t.name).toBe('hlesg_virksomhed')
    }
  })
})

describe('choices', () => {
  const choices = allColumns.filter((c): c is Extract<Column, { kind: 'choice' }> & { table: string } => c.kind === 'choice')

  it('use the publisher’s value range, with unique values and app values per column', () => {
    const low = PUBLISHER.optionValuePrefix * 10_000
    for (const c of choices) {
      for (const o of c.options) expect(o.value, `${c.name} ${o.label}`).toBeGreaterThanOrEqual(low)
      for (const o of c.options) expect(o.value).toBeLessThan(low + 10_000)
      expect(new Set(c.options.map((o) => o.value)).size, c.name).toBe(c.options.length)
      expect(new Set(c.options.map((o) => o.appValue)).size, c.name).toBe(c.options.length)
    }
  })

  it('match the app’s own values', () => {
    const values = (name: string) => choices.find((c) => c.name === name)!.options.map((o) => o.appValue)
    expect(values('hlesg_markedsinstrument')).toEqual(marketInstruments.map((m) => m.id))
    expect(values('hlesg_energiart')).toEqual(['electricity', 'heating'])
    expect(values('hlesg_kildetype')).toEqual(['publication', 'manual', 'api'])
    expect(values('hlesg_regeltype')).toEqual(['tag', 'exclude'])
    expect(values('hlesg_manuelhandling')).toEqual(['tag', 'exclude'])
    expect(values('hlesg_grundlag')).toEqual(['CO2e', 'Revenue', 'Investment'])
  })
})

describe('the account in Dataverse', () => {
  it('stores every part of a company’s account in a table that exists', () => {
    for (const key of Object.keys(emptyAccount())) {
      const where = accountStorage[key as keyof typeof accountStorage]
      if (key === 'version') expect(where).toBeNull()
      else expect(tables.map((t) => t.name), key).toContain(where?.table)
    }
  })

  it('has one line list per kind of line, and nothing else', () => {
    const lineKeys = Object.entries(accountStorage).filter(([, v]) => v?.table === 'hlesg_linje').map(([k]) => k)
    expect(lineLists.map((l) => l.appValue).sort()).toEqual(lineKeys.sort())
  })
})

describe('metadata requests', () => {
  const lcid = 1030

  it('name schema names with a capital after the prefix', () => {
    expect(schemaName('hlesg_linje')).toBe('hlesg_Linje')
    expect(schemaName('hlesg_virksomhedid')).toBe('hlesg_Virksomhedid')
  })

  it('create a user-owned, audited table with its primary name column', () => {
    const t = tables.find((x) => x.name === 'hlesg_linje')!
    const e = entity(t, lcid) as { OwnershipType: string; IsAuditEnabled: { Value: boolean }; Attributes: { IsPrimaryName: boolean; SchemaName: string; MaxLength: number }[] }
    expect(e.OwnershipType).toBe('UserOwned')
    expect(e.IsAuditEnabled.Value).toBe(true)
    expect(e.Attributes).toEqual([expect.objectContaining({ IsPrimaryName: true, SchemaName: 'hlesg_Beskrivelse', MaxLength: 400 })])
  })

  it('label in the environment’s base language', () => {
    const a = attribute({ kind: 'text', name: 'hlesg_konto', label: 'Konto', maxLength: 50 }, lcid) as { DisplayName: { LocalizedLabels: { Label: string; LanguageCode: number }[] } }
    expect(a.DisplayName.LocalizedLabels).toEqual([expect.objectContaining({ Label: 'Konto', LanguageCode: 1030 })])
  })

  it('make dates date-only, so a date never shifts with the user’s time zone', () => {
    expect(attribute({ kind: 'date', name: 'hlesg_dato', label: 'Dato' }, lcid)).toMatchObject({ Format: 'DateOnly', DateTimeBehavior: { Value: 'DateOnly' } })
  })

  it('make the company lookup parental, and other lookups referential', () => {
    const linje = tables.find((x) => x.name === 'hlesg_linje')!
    const [toCompany, toLocation] = lookups(linje.columns)
    expect(relationship(toCompany, linje.name, lcid)).toMatchObject({
      SchemaName: 'hlesg_virksomhed_linje', ReferencedEntity: 'hlesg_virksomhed', ReferencingEntity: 'hlesg_linje',
      CascadeConfiguration: { Delete: 'Cascade', Assign: 'Cascade', Share: 'Cascade' },
      Lookup: { SchemaName: 'hlesg_Virksomhedid', RequiredLevel: { Value: 'ApplicationRequired' } },
    })
    expect(relationship(toLocation, linje.name, lcid)).toMatchObject({ CascadeConfiguration: { Delete: 'Restrict', Assign: 'NoCascade' } })
  })
})
