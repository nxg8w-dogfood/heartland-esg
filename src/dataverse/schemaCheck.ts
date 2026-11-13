// What an environment is missing compared with the schema the app reads (ADR 0020).
//
// The app selects every column in schema.ts when it loads (storage/dataverse/generated.ts). A
// column that exists in the code but not in the environment fails the whole load with
// "Could not find a property named ...", so the app shows nothing at all. This compares the two
// so a deploy can stop before that happens.
//
// The comparison is one-way on purpose: columns the environment has and the schema doesn't are
// fine, since the app never asks for them.

import { tables, type Table } from './schema'

/** A table as the environment reports it: its logical name and its attributes' logical names. */
export type EnvironmentTable = { name: string; columns: readonly string[] }

export type Missing =
  | { kind: 'table'; table: string }
  | { kind: 'column'; table: string; column: string }

/** Every column name the app selects for a table: the primary name and each column. */
export function expectedColumns(table: Table): string[] {
  return [table.primary.name, ...table.columns.map((c) => c.name)]
}

/** What `schema` needs that `environment` doesn't have, in the schema's order. */
export function missingFromEnvironment(
  schema: readonly Table[],
  environment: readonly EnvironmentTable[],
): Missing[] {
  const byName = new Map(environment.map((t) => [t.name.toLowerCase(), new Set(t.columns.map((c) => c.toLowerCase()))]))
  const missing: Missing[] = []
  for (const table of schema) {
    const columns = byName.get(table.name.toLowerCase())
    if (!columns) {
      missing.push({ kind: 'table', table: table.name })
      continue
    }
    for (const column of expectedColumns(table)) {
      if (!columns.has(column.toLowerCase())) missing.push({ kind: 'column', table: table.name, column })
    }
  }
  return missing
}

/** One line per missing thing, for a deploy log or an error message. */
export function describeMissing(missing: readonly Missing[]): string[] {
  return missing.map((m) => (m.kind === 'table' ? `table ${m.table} is missing` : `${m.table} is missing the column ${m.column}`))
}

/** The schema the app reads, for callers that don't want to import both modules. */
export const appSchema = tables
