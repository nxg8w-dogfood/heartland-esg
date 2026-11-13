// Checks that an environment has every table and column the app selects when it loads
// (docs/adr/0020):
//
//   npm run dataverse:check -- --url https://<org>.crm4.dynamics.com
//
// Reads metadata only, changes nothing, and exits 1 listing what is missing. The deploy runs it
// before publishing, so a column that exists in the code but not in the environment stops the
// deploy instead of taking the app down on its next load.
//
// Signs in through the Azure CLI (`az login --tenant <tenant>` first), or with the deploy's
// service principal when its variables are set.

import { tables } from '../src/dataverse/schema.ts'
import { describeMissing, missingFromEnvironment, type EnvironmentTable } from '../src/dataverse/schemaCheck.ts'
import { client, environment } from './lib/dataverse.ts'

const { org } = environment('npm run dataverse:check -- --url https://<org>.crm4.dynamics.com')
const { find } = client(org)

/** The table as the environment has it, or null when the table isn't there at all. */
async function read(name: string): Promise<EnvironmentTable | null> {
  const path = `EntityDefinitions(LogicalName='${name}')?$select=LogicalName&$expand=Attributes($select=LogicalName)`
  const { status, json } = await find(path)
  if (status === 404 || !json) return null
  const attributes = (json.Attributes as { LogicalName?: string }[] | undefined) ?? []
  return { name: String(json.LogicalName ?? name), columns: attributes.map((a) => String(a.LogicalName ?? '')) }
}

async function main() {
  console.log(`Checking ${org} against the schema the app reads (${tables.length} tables)`)
  const found: EnvironmentTable[] = []
  for (const table of tables) {
    const one = await read(table.name)
    if (one) found.push(one)
  }

  const missing = missingFromEnvironment(tables, found)
  if (missing.length === 0) {
    console.log('The environment has every table and column the app selects.')
    return
  }

  const lines = describeMissing(missing)
  console.error(`The environment is behind the code in ${lines.length} place${lines.length === 1 ? '' : 's'}:`)
  for (const line of lines) console.error(`  ${line}`)
  console.error('\nThe app selects these when it loads, so it would fail to load entirely.')
  console.error(`Run: npm run dataverse:apply -- --url ${org}`)
  process.exitCode = 1
}

await main()
