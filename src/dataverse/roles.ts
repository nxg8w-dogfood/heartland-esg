// The security roles (docs/adr/0005 section 4, 0006 section 4), as data: which role may do what
// on which table, and how far that reaches. Dataverse enforces it on every request, so this is
// the app's authorisation; hiding things in the UI is presentation only.
//
// Reach (Dataverse's privilege depth):
//  - 'unit':  records owned in the user's business unit, that is their own company (Local)
//  - 'group': every record in the environment, that is every company (Global)
//
// Users also get Microsoft's Basic User role, for the platform privileges every app needs.
// These roles add only the hlesg_ tables.

import { schemaName } from './metadata.ts'
import { tables } from './schema.ts'

export type Operation = 'Read' | 'Create' | 'Write' | 'Delete' | 'Append' | 'AppendTo' | 'Assign' | 'Share'
export type Reach = 'unit' | 'group'

export type Role = {
  /** Unique within the environment */
  name: string
  description: string
  /** Table → operations → reach */
  privileges: Record<string, Partial<Record<Operation, Reach>>>
}

const t = (s: string) => `hlesg_${s}`
const companyTables = tables.map((x) => x.name).filter((n) => ![t('koncern'), t('virksomhed'), t('ejerandel')].includes(n))

type Grant = [table: string, ops: readonly Operation[], reach: Reach]

function build(...grants: readonly Grant[]): Role['privileges'] {
  const out: Role['privileges'] = {}
  for (const [table, ops, reach] of grants) {
    out[table] ??= {}
    for (const op of ops) {
      // The wider reach wins when two grants overlap.
      if (out[table][op] !== 'group') out[table][op] = reach
    }
  }
  return out
}

const read = (names: readonly string[], reach: Reach): Grant[] => names.map((n) => [n, ['Read'], reach])

/** Lines, surveys, investments and cars: entered by contributors (ADR 0005; cars ADR 0009). */
const entered = [t('linje'), t('pendling'), t('investering'), t('koeretoej')]

const laeser: Grant[] = [
  ...read(companyTables, 'unit'),
  [t('virksomhed'), ['Read'], 'unit'],
  [t('koncern'), ['Read'], 'group'],
]

const bidragyder: Grant[] = [
  ...laeser,
  // Create, change and delete their company's lines, surveys and investments (decided 2026-10-06).
  ...entered.map((n): Grant => [n, ['Create', 'Write', 'Delete', 'Append'], 'unit']),
  // Import ledger files and tag postings, but not delete an import (Ansvarlig, ADR 0005).
  [t('import'), ['Create', 'Write', 'Append', 'AppendTo'], 'unit'],
  [t('postering'), ['Create', 'Write', 'Append'], 'unit'],
  // Lookups: a record can only point to records the user may append to.
  [t('virksomhed'), ['AppendTo'], 'unit'],
  [t('lokation'), ['AppendTo'], 'unit'],
  [t('koeretoej'), ['AppendTo'], 'unit'],
]

const ansvarlig: Grant[] = [
  ...bidragyder,
  // Everything that changes how the account is calculated: settings, locations (decided
  // 2026-10-06), factor sources, relevance, price indices and ledger rules.
  // Fiscal periods are settings too (ADR 0013).
  ...[t('klimaregnskab'), t('regnskabsperiode'), t('lokation'), t('faktorkilde'), t('relevans'), t('indekspunkt'), t('prisaar'), t('regel')]
    .map((n): Grant => [n, ['Create', 'Write', 'Delete', 'Append'], 'unit']),
  [t('import'), ['Delete'], 'unit'],
  [t('postering'), ['Delete'], 'unit'],
  // Meters come from the nightly sync; the Ansvarlig picks each one's location, or removes it (ADR 0021).
  [t('maaler'), ['Write', 'Delete', 'Append'], 'unit'],
]

const koncernLaeser: Grant[] = read(tables.map((x) => x.name), 'group')

const koncernAnsvarlig: Grant[] = [
  ...koncernLaeser,
  // Companies and ownership shares decide the group total (ADR 0006). Assign moves a company,
  // and through its parental relationship all its records, to its business unit's team.
  [t('koncern'), ['Create', 'Write'], 'group'],
  [t('virksomhed'), ['Create', 'Write', 'Delete', 'Append', 'AppendTo', 'Assign', 'Share'], 'group'],
  [t('ejerandel'), ['Create', 'Write', 'Delete', 'Append'], 'group'],
]

/**
 * The nightly sync's application user (ADR 0021): reads every company's locations, meters and
 * lines, records the meters it finds and adds Scope 2 lines. It never deletes. Assign lets it
 * create each record owned by its company's owner team, so the company's users see it.
 */
const synkronisering: Grant[] = [
  ...read([t('virksomhed'), t('lokation'), t('maaler'), t('linje')], 'group'),
  [t('maaler'), ['Create', 'Write', 'Append', 'Assign'], 'group'],
  [t('linje'), ['Create', 'Append', 'Assign'], 'group'],
  [t('virksomhed'), ['AppendTo'], 'group'],
  [t('lokation'), ['AppendTo'], 'group'],
  // A line's car lookup stays empty, but Dataverse asks for AppendTo on every lookup target.
  [t('koeretoej'), ['AppendTo'], 'group'],
]

export const roles: readonly Role[] = [
  { name: 'Klimaregnskab – Læser', description: 'Læser sin virksomheds klimaregnskab.', privileges: build(...laeser) },
  { name: 'Klimaregnskab – Bidragyder', description: 'Opretter, retter og sletter linjer, pendlerundersøgelser, investeringer og biler, og indlæser posteringer, i sin virksomhed.', privileges: build(...bidragyder) },
  { name: 'Klimaregnskab – Ansvarlig', description: 'Har også ansvaret for virksomhedens indstillinger, lokationer, faktorkilder, relevans, prisindeks og kontoregler, og kan slette importer.', privileges: build(...ansvarlig) },
  { name: 'Koncern – Læser', description: 'Læser alle virksomheders klimaregnskaber, til koncernoversigten.', privileges: build(...koncernLaeser) },
  { name: 'Klimaregnskab – Synkronisering', description: 'Den natlige hentning af el og fjernvarme (ADR 0021): læser virksomheder, lokationer, målere og linjer, og opretter målere og Scope 2-linjer. Sletter intet. Kun til synkroniseringens applikationsbruger.', privileges: build(...synkronisering) },
  { name: 'Koncern – Ansvarlig', description: 'Opretter virksomheder og fastsætter koncernens ejerandele, som afgør koncerntotalen.', privileges: build(...koncernAnsvarlig) },
]

/** Dataverse's privilege names, e.g. prvReadhlesg_linje. */
export const privilegeName = (op: Operation, table: string) => `prv${op}${schemaName(table)}`

export const depth = (reach: Reach) => (reach === 'group' ? 'Global' : 'Local')
