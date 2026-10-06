// Applies the Dataverse schema (src/dataverse/schema.ts) to an environment: creates the publisher,
// the solution, and every table, column and lookup that's missing (docs/adr/0007).
//
//   npm run dataverse:apply -- --url https://<org>.crm4.dynamics.com [--dry-run]
//
// Signs in through the Azure CLI (`az login --tenant <tenant>` first), so no credentials pass
// through this script. It only creates: it never changes or deletes anything that exists, and
// reports existing columns whose type differs from the schema instead of touching them.

import { execFileSync } from 'node:child_process'
import { attribute, entity, relationship } from '../src/dataverse/metadata.ts'
import { PUBLISHER, SOLUTION, tables, type Column } from '../src/dataverse/schema.ts'

const args = process.argv.slice(2)
const urlArg = args[args.indexOf('--url') + 1]
const dryRun = args.includes('--dry-run')
if (!args.includes('--url') || !urlArg || !/^https:\/\/[a-z0-9-]+\.crm\d*\.dynamics\.com\/?$/.test(urlArg)) {
  console.error('Usage: npm run dataverse:apply -- --url https://<org>.crm4.dynamics.com [--dry-run]')
  process.exit(2)
}
const org = urlArg.replace(/\/$/, '')
const api = `${org}/api/data/v9.2`

function token(): string {
  try {
    return execFileSync('az', ['account', 'get-access-token', '--resource', org, '--query', 'accessToken', '-o', 'tsv'], { encoding: 'utf8' }).trim()
  } catch {
    console.error(`Couldn't get a token for ${org} from the Azure CLI. Sign in with: az login --tenant <tenant-id>`)
    process.exit(1)
  }
}
const bearer = token()

type Json = Record<string, unknown>

async function call(method: string, path: string, body?: Json, solution = false): Promise<{ status: number; json: Json | null }> {
  const res = await fetch(`${api}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      ...(solution ? { 'MSCRM.SolutionUniqueName': SOLUTION.uniqueName } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const json = text ? (JSON.parse(text) as Json) : null
  if (!res.ok && res.status !== 404) {
    const message = (json?.error as { message?: string } | undefined)?.message ?? text
    throw new Error(`${method} ${path} → ${res.status}: ${message}`)
  }
  return { status: res.status, json }
}

const get = (path: string) => call('GET', path)
const values = (r: { json: Json | null }) => ((r.json?.value as Json[] | undefined) ?? [])

const done: string[] = []
const would: string[] = []
const warnings: string[] = []
async function create(what: string, method: string, path: string, body: Json, solution = true) {
  if (dryRun) { would.push(what); return null }
  const r = await call(method, path, body, solution)
  done.push(what)
  return r
}

async function main() {
  const who = await get('WhoAmI')
  console.log(`Signed in to ${org} as user ${(who.json as { UserId: string }).UserId}${dryRun ? ' (dry run: nothing is changed)' : ''}`)
  const lcid = (values(await get('organizations?$select=languagecode'))[0]?.languagecode as number | undefined) ?? 1033
  console.log(`Labels in the environment's base language: ${lcid}`)

  // Publisher: the prefix belongs to it and can't be changed later, so refuse a clash.
  const byPrefix = values(await get(`publishers?$select=uniquename,customizationprefix&$filter=customizationprefix eq '${PUBLISHER.prefix}'`))
  const other = byPrefix.find((p) => p.uniquename !== PUBLISHER.uniqueName)
  if (other) throw new Error(`The prefix ${PUBLISHER.prefix} already belongs to the publisher ${String(other.uniquename)}.`)
  let publisher = values(await get(`publishers?$select=publisherid,customizationprefix&$filter=uniquename eq '${PUBLISHER.uniqueName}'`))[0]
  if (!publisher) {
    await create(`publisher ${PUBLISHER.uniqueName} (${PUBLISHER.prefix})`, 'POST', 'publishers', {
      uniquename: PUBLISHER.uniqueName, friendlyname: PUBLISHER.friendlyName,
      customizationprefix: PUBLISHER.prefix, customizationoptionvalueprefix: PUBLISHER.optionValuePrefix,
    }, false)
    if (!dryRun) publisher = values(await get(`publishers?$select=publisherid&$filter=uniquename eq '${PUBLISHER.uniqueName}'`))[0]
  }

  if (!values(await get(`solutions?$select=solutionid&$filter=uniquename eq '${SOLUTION.uniqueName}'`)).length) {
    await create(`solution ${SOLUTION.uniqueName}`, 'POST', 'solutions', {
      uniquename: SOLUTION.uniqueName, friendlyname: SOLUTION.friendlyName, version: SOLUTION.version,
      ...(publisher ? { 'publisherid@odata.bind': `/publishers(${String(publisher.publisherid)})` } : {}),
    }, false)
  }

  // Tables first, so every lookup's target exists before the lookups are created.
  for (const t of tables) {
    if ((await get(`EntityDefinitions(LogicalName='${t.name}')?$select=LogicalName`)).status === 404) {
      await create(`table ${t.name}`, 'POST', 'EntityDefinitions', entity(t, lcid))
    }
  }

  for (const t of tables) {
    const existing = new Map<string, string>()
    const r = await get(`EntityDefinitions(LogicalName='${t.name}')/Attributes?$select=LogicalName,AttributeType`)
    if (r.status !== 404) for (const a of values(r)) existing.set(String(a.LogicalName), String(a.AttributeType))
    for (const c of t.columns) {
      const type = existing.get(c.name)
      if (type) {
        const expected = expectedType(c)
        if (type !== expected) warnings.push(`${t.name}.${c.name} is ${type} in the environment, ${expected} in the schema; left as it is.`)
        continue
      }
      if (c.kind === 'lookup') await create(`lookup ${t.name}.${c.name} → ${c.target}`, 'POST', 'RelationshipDefinitions', relationship(c, t.name, lcid))
      else await create(`column ${t.name}.${c.name}`, 'POST', `EntityDefinitions(LogicalName='${t.name}')/Attributes`, attribute(c, lcid))
    }
  }

  if (!dryRun && done.length) {
    await call('POST', 'PublishAllXml', {})
    done.push('published all customizations')
  }

  for (const w of warnings) console.warn(`warning: ${w}`)
  if (dryRun) console.log(would.length ? `Would create ${would.length}:\n  ${would.join('\n  ')}` : 'Nothing to create: the environment matches the schema.')
  else console.log(done.length ? `Created ${done.length}:\n  ${done.join('\n  ')}` : 'Nothing to create: the environment matches the schema.')
}

function expectedType(c: Column): string {
  return { text: 'String', memo: 'Memo', decimal: 'Decimal', integer: 'Integer', date: 'DateTime', datetime: 'DateTime', boolean: 'Boolean', choice: 'Picklist', lookup: 'Lookup' }[c.kind]
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  if (done.length) console.error(`Created before the error:\n  ${done.join('\n  ')}\nRun again to continue; existing items are skipped.`)
  process.exit(1)
})
