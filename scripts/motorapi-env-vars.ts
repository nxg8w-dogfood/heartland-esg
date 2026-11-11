// Creates the MotorAPI connector's environment variables in a Power Platform environment, in
// the HeartlandESG solution (connectors/motorapi/README.md step 4, docs/adr/0009):
//
//   npm run motorapi:env-vars -- --url https://<org>.crm4.dynamics.com --env dev [--dry-run]
//
// The values come from the infra/motorapi deployment's outputs (deployment hlesg-motorapi-<env>
// in --resource-group, default rg-heartland-ai). The client secret is a Secret variable: it
// holds only the Key Vault secret's resource ID, and Dataverse reads the secret itself. Run it
// again to update values; definitions that exist are kept.
//
// Signs in through the Azure CLI (`az login --tenant <tenant>` first).

import { execFileSync } from 'node:child_process'
import { SOLUTION } from '../src/dataverse/schema.ts'
import { client, environment } from './lib/dataverse.ts'

const usage = 'npm run motorapi:env-vars -- --url https://<org>.crm4.dynamics.com --env dev|test|prod [--resource-group <rg>] [--dry-run]'
const { org, dryRun, arg } = environment(usage)
const env = arg('--env')
if (!env || !['dev', 'test', 'prod'].includes(env)) {
  console.error(`Usage: ${usage}`)
  process.exit(2)
}
const resourceGroup = arg('--resource-group') ?? 'rg-heartland-ai'
const deployment = `hlesg-motorapi-${env}`

const az = (...args: string[]) => execFileSync('az', args, { encoding: 'utf8' }).trim()

type Output = { value: string }
const outputs = JSON.parse(az('deployment', 'group', 'show', '--resource-group', resourceGroup, '--name', deployment, '--query', 'properties.outputs', '-o', 'json')) as Record<string, Output>
const params = JSON.parse(az('deployment', 'group', 'show', '--resource-group', resourceGroup, '--name', deployment, '--query', 'properties.parameters', '-o', 'json')) as Record<string, Output>
const secretName = params.connectorSecretName?.value
if (!secretName) {
  console.error(`The deployment ${deployment} has no connectorSecretName. Create the secret (README step 3), set it in the .bicepparam and deploy again.`)
  process.exit(1)
}
// Lists names only, so the secret's value is never read here.
const exists = az('keyvault', 'secret', 'list', '--vault-name', params.keyVaultName.value, '--query', `[?name=='${secretName}'] | length(@)`, '-o', 'tsv')
if (exists !== '1') {
  console.error(`No secret ${secretName} in ${params.keyVaultName.value}. Create it first (README step 3).`)
  process.exit(1)
}
const subscription = az('account', 'show', '--query', 'id', '-o', 'tsv')
// Dataverse wants the secret's Azure resource ID, not its URL.
const secretResourceId = `/subscriptions/${subscription}/resourceGroups/${resourceGroup}/providers/Microsoft.KeyVault/vaults/${params.keyVaultName.value}/secrets/${secretName}`

const TEXT = 100000000
const SECRET = 100000005
const variables = [
  { schemaName: 'hlesg_MotorApiHost', displayName: 'MotorAPI: API Management host', type: TEXT, value: outputs.hlesg_MotorApiHost.value },
  { schemaName: 'hlesg_TenantId', displayName: 'MotorAPI: Entra tenant ID', type: TEXT, value: outputs.hlesg_TenantId.value },
  { schemaName: 'hlesg_MotorApiAudience', displayName: 'MotorAPI: proxy audience (resource URI)', type: TEXT, value: outputs.hlesg_MotorApiAudience.value },
  { schemaName: 'hlesg_MotorApiConnectorClientId', displayName: 'MotorAPI: connector client ID', type: TEXT, value: outputs.hlesg_MotorApiConnectorClientId.value },
  { schemaName: 'hlesg_MotorApiConnectorClientSecret', displayName: 'MotorAPI: connector client secret (Key Vault)', type: SECRET, value: secretResourceId },
]

const { call, get, values, createdId, q } = client(org, SOLUTION.uniqueName)

async function main() {
  const who = (await get('WhoAmI')).json as { UserId: string }
  console.log(`Signed in to ${org} as user ${who.UserId}${dryRun ? ' (dry run: nothing is changed)' : ''}`)
  if (!(await values(`solutions?$select=solutionid&$filter=uniquename eq ${q(SOLUTION.uniqueName)}`)).length) {
    throw new Error(`No solution ${SOLUTION.uniqueName} in ${org}. Run npm run dataverse:apply first.`)
  }

  const changes: string[] = []
  for (const v of variables) {
    const [def] = await values(`environmentvariabledefinitions?$select=environmentvariabledefinitionid,type&$filter=schemaname eq ${q(v.schemaName)}`)
    let defId = def?.environmentvariabledefinitionid as string | undefined
    if (def && def.type !== v.type) throw new Error(`${v.schemaName} exists with another type (${String(def.type)}); fix it by hand.`)
    if (!defId) {
      changes.push(`create ${v.schemaName}`)
      if (!dryRun) {
        const r = await call('POST', 'environmentvariabledefinitions', { schemaname: v.schemaName, displayname: v.displayName, type: v.type, ...(v.type === SECRET ? { secretstore: 0 } : {}) }, true)
        defId = createdId(r.headers) ?? undefined
      }
    }
    const [current] = defId ? await values(`environmentvariablevalues?$select=environmentvariablevalueid,value&$filter=_environmentvariabledefinitionid_value eq ${defId}`) : []
    if (current?.value === v.value) continue
    changes.push(`${current ? 'update' : 'set'} ${v.schemaName} = ${v.value}`)
    if (dryRun) continue
    if (current) await call('PATCH', `environmentvariablevalues(${String(current.environmentvariablevalueid)})`, { value: v.value })
    else await call('POST', 'environmentvariablevalues', { schemaname: `${v.schemaName}_value`, value: v.value, 'EnvironmentVariableDefinitionId@odata.bind': `/environmentvariabledefinitions(${defId})` })
  }
  console.log(changes.length ? `${dryRun ? 'Would change' : 'Changed'} ${changes.length}:\n  ${changes.join('\n  ')}` : 'Nothing to change: the variables match the deployment.')
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
