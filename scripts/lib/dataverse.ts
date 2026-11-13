// The Dataverse Web API client the scripts share: the environment from --url, a token, and JSON
// requests.
//
// The token comes from the Azure CLI (`az login` first) when a person runs a script. In CI there
// is no Azure CLI, so the deploy's own service principal is used instead, through the same
// variables the Power Apps CLI reads. No credentials pass through the scripts themselves.

import { execFileSync } from 'node:child_process'

export type Json = Record<string, unknown>

export function environment(usage: string): { org: string; dryRun: boolean; arg: (name: string) => string | undefined } {
  const args = process.argv.slice(2)
  const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
  const url = arg('--url')
  if (!url || !/^https:\/\/[a-z0-9-]+\.crm\d*\.dynamics\.com\/?$/.test(url)) {
    console.error(`Usage: ${usage}`)
    process.exit(2)
  }
  return { org: url.replace(/\/$/, ''), dryRun: args.includes('--dry-run'), arg }
}

/**
 * A token for the environment: the deploy's service principal when its variables are set
 * (PA_CLI_USE_SP_AUTH, as in .github/workflows/deploy.yml), otherwise the signed-in Azure CLI.
 */
async function accessToken(org: string): Promise<string> {
  const { PA_CLI_SP_CLIENT_ID: id, PA_CLI_SP_TENANT_ID: tenant, PA_CLI_SP_CLIENT_SECRET: secret } = process.env
  if (id && tenant && secret) {
    const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: id, client_secret: secret, scope: `${org}/.default`, grant_type: 'client_credentials' }),
    })
    const json = (await res.json()) as { access_token?: string; error_description?: string }
    if (!res.ok || !json.access_token) throw new Error(`Couldn't get a token for ${org} for the service principal: ${json.error_description ?? res.status}`)
    return json.access_token
  }
  try {
    return execFileSync('az', ['account', 'get-access-token', '--resource', org, '--query', 'accessToken', '-o', 'tsv'], { encoding: 'utf8' }).trim()
  } catch {
    console.error(`Couldn't get a token for ${org} from the Azure CLI. Sign in with: az login --tenant <tenant-id>`)
    process.exit(1)
  }
}

export function client(org: string, solution?: string) {
  let bearer: string | null = null
  const api = `${org}/api/data/v9.2`

  /** A 404 is returned only when `missingOk` is set (to check whether something exists); otherwise it throws like any error. */
  async function call(method: string, path: string, body?: Json, inSolution = false, missingOk = false): Promise<{ status: number; json: Json | null; headers: Headers }> {
    bearer ??= await accessToken(org)
    const res = await fetch(`${api}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${bearer}`,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        ...(inSolution && solution ? { 'MSCRM.SolutionUniqueName': solution } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    const json = text ? (JSON.parse(text) as Json) : null
    if (!res.ok && !(missingOk && res.status === 404)) {
      const message = (json?.error as { message?: string } | undefined)?.message ?? text
      throw new Error(`${method} ${path} → ${res.status}: ${message}`)
    }
    return { status: res.status, json, headers: res.headers }
  }

  const get = (path: string) => call('GET', path)
  /** GET where "not found" is an answer, not an error: status 404 means it doesn't exist. */
  const find = (path: string) => call('GET', path, undefined, false, true)
  const values = async (path: string) => (((await get(path)).json?.value as Json[] | undefined) ?? [])
  /** The id of a record just created, from its OData-EntityId header */
  const createdId = (headers: Headers) => headers.get('OData-EntityId')?.match(/\(([0-9a-f-]{36})\)$/)?.[1] ?? null
  /** OData string literal: quotes doubled */
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`

  return { call, get, find, values, createdId, q }
}

export type Client = ReturnType<typeof client>
