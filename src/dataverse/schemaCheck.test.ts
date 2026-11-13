import { describe, expect, it } from 'vitest'
import { tables } from './schema'
import { describeMissing, expectedColumns, missingFromEnvironment, type EnvironmentTable } from './schemaCheck'

/** The environment as it would be if it matched the schema exactly. */
const upToDate = (): EnvironmentTable[] => tables.map((t) => ({ name: t.name, columns: expectedColumns(t) }))

describe('expectedColumns', () => {
  it('is the primary name column and every column the app selects', () => {
    const regel = tables.find((t) => t.name === 'hlesg_regel')!
    const expected = expectedColumns(regel)
    expect(expected[0]).toBe(regel.primary.name)
    expect(expected).toHaveLength(regel.columns.length + 1)
    for (const c of regel.columns) expect(expected).toContain(c.name)
  })
})

describe('missingFromEnvironment', () => {
  it('finds nothing when the environment matches', () => {
    expect(missingFromEnvironment(tables, upToDate())).toEqual([])
  })

  it('ignores columns the environment has but the app never asks for', () => {
    const extra = upToDate().map((t) => ({ ...t, columns: [...t.columns, 'hlesg_noget_andet', 'createdon'] }))
    expect(missingFromEnvironment(tables, extra)).toEqual([])
  })

  it('ignores the case the environment reports names in', () => {
    const shouted = upToDate().map((t) => ({ name: t.name.toUpperCase(), columns: t.columns.map((c) => c.toUpperCase()) }))
    expect(missingFromEnvironment(tables, shouted)).toEqual([])
  })

  it('names the column that took dev down on 2026-11-13', () => {
    // hlesg_regel without the four columns ADR 0018 added.
    const behind = upToDate().map((t) =>
      t.name === 'hlesg_regel'
        ? { ...t, columns: t.columns.filter((c) => !['hlesg_standardregel', 'hlesg_handling', 'hlesg_flyttil', 'hlesg_aendret'].includes(c)) }
        : t,
    )
    const missing = missingFromEnvironment(tables, behind)
    expect(missing).toContainEqual({ kind: 'column', table: 'hlesg_regel', column: 'hlesg_standardregel' })
    expect(missing).toHaveLength(4)
    expect(describeMissing(missing)).toContain('hlesg_regel is missing the column hlesg_standardregel')
  })

  it('reports a whole table once, not each of its columns', () => {
    const without = upToDate().filter((t) => t.name !== 'hlesg_postering')
    expect(missingFromEnvironment(tables, without)).toEqual([{ kind: 'table', table: 'hlesg_postering' }])
    expect(describeMissing(missingFromEnvironment(tables, without))).toEqual(['table hlesg_postering is missing'])
  })

  it('reports an empty environment as every table missing', () => {
    expect(missingFromEnvironment(tables, [])).toHaveLength(tables.length)
  })
})
