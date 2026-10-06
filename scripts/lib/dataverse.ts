// The Dataverse Web API client the scripts share: the environment from --url, a token from the
// Azure CLI (`az login` first), and JSON requests. No credentials pass through the scripts.

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

export function client(org: string, solution?: string) {
  let bearer: string
  try {
    bearer = execFileSync('az', ['account', 'get-access-token', '--resource', org, '--query', 'accessToken', '-o', 'tsv'], { encoding: 'utf8' }).trim()
  } catch {
    console.error(`Couldn't get a token for ${org} from the Azure CLI. Sign in with: az login --tenant <tenant-id>`)
    process.exit(1)
  }
  const api = `${org}/api/data/v9.2`

  async function call(method: string, path: string, body?: Json, inSolution = false): Promise<{ status: number; json: Json | null; headers: Headers }> {
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
    if (!res.ok && res.status !== 404) {
      const message = (json?.error as { message?: string } | undefined)?.message ?? text
      throw new Error(`${method} ${path} → ${res.status}: ${message}`)
    }
    return { status: res.status, json, headers: res.headers }
  }

  const get = (path: string) => call('GET', path)
  const values = async (path: string) => (((await get(path)).json?.value as Json[] | undefined) ?? [])
  /** The id of a record just created, from its OData-EntityId header */
  const createdId = (headers: Headers) => headers.get('OData-EntityId')?.match(/\(([0-9a-f-]{36})\)$/)?.[1] ?? null
  /** OData string literal: quotes doubled */
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`

  return { call, get, values, createdId, q }
}

export type Client = ReturnType<typeof client>
