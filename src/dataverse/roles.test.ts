import { describe, expect, it } from 'vitest'
import { depth, privilegeName, roles, type Operation, type Role } from './roles'
import { tables, type Column } from './schema'

const role = (name: string) => roles.find((r) => r.name === name)!
const can = (r: Role, table: string, op: Operation) => r.privileges[table]?.[op]
const lookups = (table: string) => tables.find((t) => t.name === table)!.columns.filter((c): c is Extract<Column, { kind: 'lookup' }> => c.kind === 'lookup')

const laeser = role('Klimaregnskab – Læser')
const bidragyder = role('Klimaregnskab – Bidragyder')
const ansvarlig = role('Klimaregnskab – Ansvarlig')
const koncernLaeser = role('Koncern – Læser')
const koncernAnsvarlig = role('Koncern – Ansvarlig')

describe('security roles', () => {
  it('only grant privileges on tables in the schema', () => {
    for (const r of roles) for (const table of Object.keys(r.privileges)) expect(tables.map((t) => t.name), `${r.name}: ${table}`).toContain(table)
  })

  it('let every role read the account tables it works with', () => {
    for (const r of [laeser, bidragyder, ansvarlig]) {
      for (const t of ['hlesg_linje', 'hlesg_klimaregnskab', 'hlesg_faktorkilde', 'hlesg_virksomhed']) expect(can(r, t, 'Read'), `${r.name} ${t}`).toBe('unit')
    }
  })

  it('keep company roles inside their own company', () => {
    for (const r of [laeser, bidragyder, ansvarlig]) {
      for (const [table, ops] of Object.entries(r.privileges)) {
        for (const [op, reach] of Object.entries(ops)) {
          // The group's name is the only thing a company role sees across companies.
          if (!(table === 'hlesg_koncern' && op === 'Read')) expect(reach, `${r.name} ${op} ${table}`).toBe('unit')
        }
      }
      expect(r.privileges.hlesg_ejerandel, r.name).toBeUndefined()
    }
  })

  it('build each role on the one below it', () => {
    const covers = (wide: Role, narrow: Role) => {
      for (const [table, ops] of Object.entries(narrow.privileges)) for (const op of Object.keys(ops)) expect(can(wide, table, op as Operation), `${wide.name} ⊇ ${narrow.name}: ${op} ${table}`).toBeDefined()
    }
    covers(bidragyder, laeser)
    covers(ansvarlig, bidragyder)
    covers(koncernAnsvarlig, koncernLaeser)
  })

  it('let contributors change lines, surveys and investments, but not what changes the calculation', () => {
    for (const t of ['hlesg_linje', 'hlesg_pendling', 'hlesg_investering']) {
      for (const op of ['Create', 'Write', 'Delete'] as const) expect(can(bidragyder, t, op), `${op} ${t}`).toBe('unit')
    }
    for (const t of ['hlesg_faktorkilde', 'hlesg_regel', 'hlesg_relevans', 'hlesg_lokation', 'hlesg_klimaregnskab', 'hlesg_indekspunkt', 'hlesg_prisaar']) {
      expect(can(bidragyder, t, 'Write'), t).toBeUndefined()
      expect(can(ansvarlig, t, 'Write'), t).toBe('unit')
    }
    expect(can(bidragyder, 'hlesg_import', 'Delete')).toBeUndefined()
    expect(can(ansvarlig, 'hlesg_import', 'Delete')).toBe('unit')
  })

  it('leave companies and ownership shares to Koncern – Ansvarlig', () => {
    for (const r of roles.filter((x) => x !== koncernAnsvarlig)) {
      for (const t of ['hlesg_virksomhed', 'hlesg_ejerandel', 'hlesg_koncern']) expect(can(r, t, 'Write'), `${r.name} ${t}`).toBeUndefined()
    }
    for (const op of ['Create', 'Write', 'Delete', 'Assign'] as const) expect(can(koncernAnsvarlig, 'hlesg_virksomhed', op)).toBe('group')
    expect(can(koncernAnsvarlig, 'hlesg_ejerandel', 'Write')).toBe('group')
  })

  it('let the group roles read every company', () => {
    for (const t of tables) expect(can(koncernLaeser, t.name, 'Read'), t.name).toBe('group')
  })

  it('grant what a lookup needs wherever a role creates the record: Append on it, AppendTo on the target', () => {
    for (const r of roles) {
      for (const [table, ops] of Object.entries(r.privileges)) {
        if (!ops.Create) continue
        for (const l of lookups(table)) {
          expect(ops.Append, `${r.name}: Append on ${table}`).toBeDefined()
          expect(can(r, l.target, 'AppendTo'), `${r.name}: AppendTo on ${l.target} for ${table}.${l.name}`).toBeDefined()
        }
      }
    }
  })

  it('use Dataverse’s privilege names and depths', () => {
    expect(privilegeName('Read', 'hlesg_linje')).toBe('prvReadhlesg_Linje')
    expect(privilegeName('AppendTo', 'hlesg_virksomhed')).toBe('prvAppendTohlesg_Virksomhed')
    expect([depth('unit'), depth('group')]).toEqual(['Local', 'Global'])
  })
})
