// Applies the Dataverse schema and security roles (src/dataverse/schema.ts and roles.ts) to an
// environment (docs/adr/0007):
//
//   npm run dataverse:apply -- --url https://<org>.crm4.dynamics.com [--dry-run]
//
// - Publisher, solution, tables, columns and lookups: created when missing. Nothing that exists
//   is changed or deleted; an existing column of another type is reported, not touched.
// - Security roles: created when missing, and their hlesg_ privileges set to exactly what
//   roles.ts says, since the roles belong to this app. Other privileges are left alone.
//
// Signs in through the Azure CLI (`az login --tenant <tenant>` first).

import { attribute, entity, relationship } from '../src/dataverse/metadata.ts'
import { depth, privilegeName, roles, type Operation } from '../src/dataverse/roles.ts'
import { PUBLISHER, SOLUTION, tables, type Column } from '../src/dataverse/schema.ts'
import { client, environment, type Json } from './lib/dataverse.ts'

const { org, dryRun } = environment('npm run dataverse:apply -- --url https://<org>.crm4.dynamics.com [--dry-run]')
const { call, get, find, values, createdId, q } = client(org, SOLUTION.uniqueName)

const done: string[] = []
const would: string[] = []
const warnings: string[] = []
async function change(what: string, method: string, path: string, body: Json, inSolution = true) {
  if (dryRun) { would.push(what); return null }
  const r = await call(method, path, body, inSolution)
  done.push(what)
  return r
}

async function main() {
  const who = (await get('WhoAmI')).json as { UserId: string }
  console.log(`Signed in to ${org} as user ${who.UserId}${dryRun ? ' (dry run: nothing is changed)' : ''}`)
  const lcid = ((await values('organizations?$select=languagecode'))[0]?.languagecode as number | undefined) ?? 1033
  console.log(`Labels in the environment's base language: ${lcid}`)

  await publisherAndSolution()
  await schema(lcid)
  await securityRoles()

  if (!dryRun && done.length) {
    await call('POST', 'PublishAllXml', {})
    done.push('published all customizations')
  }

  for (const w of warnings) console.warn(`warning: ${w}`)
  if (dryRun) console.log(would.length ? `Would change ${would.length}:\n  ${would.join('\n  ')}` : 'Nothing to change: the environment matches the schema and roles.')
  else console.log(done.length ? `Changed ${done.length}:\n  ${done.join('\n  ')}` : 'Nothing to change: the environment matches the schema and roles.')
}

async function publisherAndSolution() {
  // The prefix belongs to the publisher and can't be changed later, so refuse a clash.
  const byPrefix = await values(`publishers?$select=uniquename&$filter=customizationprefix eq ${q(PUBLISHER.prefix)}`)
  const other = byPrefix.find((p) => p.uniquename !== PUBLISHER.uniqueName)
  if (other) throw new Error(`The prefix ${PUBLISHER.prefix} already belongs to the publisher ${String(other.uniquename)}.`)
  let publisher = (await values(`publishers?$select=publisherid&$filter=uniquename eq ${q(PUBLISHER.uniqueName)}`))[0]
  if (!publisher) {
    await change(`publisher ${PUBLISHER.uniqueName} (${PUBLISHER.prefix})`, 'POST', 'publishers', {
      uniquename: PUBLISHER.uniqueName, friendlyname: PUBLISHER.friendlyName,
      customizationprefix: PUBLISHER.prefix, customizationoptionvalueprefix: PUBLISHER.optionValuePrefix,
    }, false)
    if (!dryRun) publisher = (await values(`publishers?$select=publisherid&$filter=uniquename eq ${q(PUBLISHER.uniqueName)}`))[0]
  }
  if (!(await values(`solutions?$select=solutionid&$filter=uniquename eq ${q(SOLUTION.uniqueName)}`)).length) {
    await change(`solution ${SOLUTION.uniqueName}`, 'POST', 'solutions', {
      uniquename: SOLUTION.uniqueName, friendlyname: SOLUTION.friendlyName, version: SOLUTION.version,
      ...(publisher ? { 'publisherid@odata.bind': `/publishers(${String(publisher.publisherid)})` } : {}),
    }, false)
  }
}

async function schema(lcid: number) {
  // Tables first, so every lookup's target exists before the lookups are created.
  for (const t of tables) {
    if ((await find(`EntityDefinitions(LogicalName='${t.name}')?$select=LogicalName`)).status === 404) {
      await change(`table ${t.name}`, 'POST', 'EntityDefinitions', entity(t, lcid))
    }
  }
  for (const t of tables) {
    const existing = new Map<string, string>()
    const r = await find(`EntityDefinitions(LogicalName='${t.name}')/Attributes?$select=LogicalName,AttributeType`)
    if (r.status !== 404) for (const a of (r.json?.value as Json[]) ?? []) existing.set(String(a.LogicalName), String(a.AttributeType))
    for (const c of t.columns) {
      const type = existing.get(c.name)
      if (type) {
        if (type !== expectedType(c)) warnings.push(`${t.name}.${c.name} is ${type} in the environment, ${expectedType(c)} in the schema; left as it is.`)
        continue
      }
      if (c.kind === 'lookup') await change(`lookup ${t.name}.${c.name} → ${c.target}`, 'POST', 'RelationshipDefinitions', relationship(c, t.name, lcid))
      else await change(`column ${t.name}.${c.name}`, 'POST', `EntityDefinitions(LogicalName='${t.name}')/Attributes`, attribute(c, lcid))
    }
  }
}

async function securityRoles() {
  // Roles live in the root business unit and apply in every business unit below it.
  const root = (await values('businessunits?$select=businessunitid,name&$filter=_parentbusinessunitid_value eq null'))[0]
  if (!root) throw new Error('No root business unit found.')
  const rootId = String(root.businessunitid)

  // Every hlesg_ privilege in the environment, by name. Missing ones mean a table wasn't created.
  const privileges = new Map<string, string>()
  for (const p of await values(`privileges?$select=privilegeid,name&$filter=contains(name,'hlesg_')`)) privileges.set(String(p.name), String(p.privilegeid))
  // Check every privilege the roles need exists, before changing anything.
  const needed = roles.flatMap((r) => Object.entries(r.privileges).flatMap(([table, ops]) => Object.keys(ops).map((op) => privilegeName(op as Operation, table))))
  const unknown = [...new Set(needed)].filter((n) => !privileges.has(n))
  if (unknown.length) {
    const message = `Privileges not in the environment: ${unknown.join(', ')}`
    if (dryRun) warnings.push(`${message} (expected if tables are still to be created)`)
    else throw new Error(message)
  }

  for (const role of roles) {
    let role_ = (await values(`roles?$select=roleid&$filter=name eq ${q(role.name)} and _businessunitid_value eq ${rootId}`))[0]
    if (!role_) {
      const r = await change(`role ${role.name}`, 'POST', 'roles', { name: role.name, description: role.description, 'businessunitid@odata.bind': `/businessunits(${rootId})` }, false)
      if (dryRun) { would.push(`  its ${count(role.privileges)} hlesg_ privileges`); continue }
      const id = r && createdId(r.headers)
      if (!id) throw new Error(`Created the role ${role.name}, but got no id back.`)
      role_ = { roleid: id }
      await change(`role ${role.name} added to ${SOLUTION.uniqueName}`, 'POST', 'AddSolutionComponent', {
        ComponentId: id, ComponentType: 20, SolutionUniqueName: SOLUTION.uniqueName, AddRequiredComponents: false,
      }, false)
    }
    const roleId = String(role_.roleid)

    const current = new Map<string, string>()
    const held = (await get(`RetrieveRolePrivilegesRole(RoleId=@p)?@p=${roleId}`)).json?.RolePrivileges as { PrivilegeName: string; PrivilegeId: string; Depth: string }[] | undefined
    for (const p of held ?? []) if (p.PrivilegeName.includes('hlesg_')) current.set(p.PrivilegeName, p.Depth)

    const wanted = new Map<string, string>()
    for (const [table, ops] of Object.entries(role.privileges)) {
      for (const [op, reach] of Object.entries(ops)) wanted.set(privilegeName(op as Operation, table), depth(reach))
    }

    const toAdd = [...wanted].filter(([name, d]) => current.get(name) !== d)
    if (toAdd.length) {
      await change(`role ${role.name}: set ${toAdd.length} privileges`, 'POST', `roles(${roleId})/Microsoft.Dynamics.CRM.AddPrivilegesRole`, {
        Privileges: toAdd.map(([name, d]) => ({ Depth: d, PrivilegeId: privileges.get(name), BusinessUnitId: rootId })),
      }, false)
    }
    for (const [name] of [...current].filter(([name]) => !wanted.has(name))) {
      const id = (await values(`privileges?$select=privilegeid&$filter=name eq ${q(name)}`))[0]?.privilegeid
      await change(`role ${role.name}: remove ${name}`, 'POST', `roles(${roleId})/Microsoft.Dynamics.CRM.RemovePrivilegeRole`, { PrivilegeId: id }, false)
    }
  }
}

const count = (p: Record<string, Partial<Record<Operation, unknown>>>) => Object.values(p).reduce((n, ops) => n + Object.keys(ops).length, 0)

function expectedType(c: Column): string {
  return { text: 'String', memo: 'Memo', decimal: 'Decimal', integer: 'Integer', date: 'DateTime', datetime: 'DateTime', boolean: 'Boolean', choice: 'Picklist', lookup: 'Lookup' }[c.kind]
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  if (done.length) console.error(`Changed before the error:\n  ${done.join('\n  ')}\nRun again to continue; what's done is skipped.`)
  process.exit(1)
})
