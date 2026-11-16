// Key Vault and Dataverse for the sync, through the Function App's managed identity
// (https://learn.microsoft.com/azure/app-service/overview-managed-identity#rest-endpoint-reference).
// No credentials in code or settings: the platform gives the app a local token endpoint.

import type { DataverseApi, Json } from '../../../src/sync/utilitySync'

export type Fetch = typeof fetch

/** A managed identity token for a resource, cached until five minutes before it expires. */
export function managedIdentity(doFetch: Fetch, env: Record<string, string | undefined> = process.env) {
  const cache = new Map<string, { token: string; expiresMs: number }>()
  return async (resource: string): Promise<string> => {
    const hit = cache.get(resource)
    if (hit && hit.expiresMs - 300_000 > Date.now()) return hit.token
    const endpoint = env.IDENTITY_ENDPOINT
    const header = env.IDENTITY_HEADER
    if (!endpoint || !header) throw new Error('No managed identity: IDENTITY_ENDPOINT is not set. Turn on the system-assigned identity (infra/utility-sync).')
    const url = `${endpoint}?resource=${encodeURIComponent(resource)}&api-version=2019-08-01`
    const res = await doFetch(url, { headers: { 'X-IDENTITY-HEADER': header } })
    if (!res.ok) throw new Error(`Managed identity token for ${resource}: HTTP ${res.status}`)
    const body = (await res.json()) as { access_token: string; expires_on: string | number }
    cache.set(resource, { token: body.access_token, expiresMs: Number(body.expires_on) * 1000 })
    return body.access_token
  }
}

type Token = (resource: string) => Promise<string>

/** A secret's current value; null when the company has no such secret. */
export function keyVault(doFetch: Fetch, token: Token, vaultUrl: string) {
  const base = vaultUrl.replace(/\/$/, '')
  return async (name: string): Promise<string | null> => {
    const res = await doFetch(`${base}/secrets/${encodeURIComponent(name)}?api-version=7.4`, { headers: { Authorization: `Bearer ${await token('https://vault.azure.net')}` } })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Key Vault ${name}: HTTP ${res.status}`)
    return ((await res.json()) as { value: string }).value
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * The Dataverse Web API. A request turned away by the service protection limits (429) is
 * retried after the Retry-After it gives, a few times.
 */
export function dataverse(doFetch: Fetch, token: Token, orgUrl: string, pause: (ms: number) => Promise<unknown> = wait): DataverseApi {
  const org = orgUrl.replace(/\/$/, '')
  const api = `${org}/api/data/v9.2/`
  async function call(method: string, url: string, body?: Json, extra: Record<string, string> = {}): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const res = await doFetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${await token(org)}`,
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
          ...extra,
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (res.status === 429 && attempt < 5) {
        await pause(Number(res.headers.get('Retry-After') ?? '5') * 1000)
        continue
      }
      if (!res.ok) {
        const detail = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message
        throw new Error(`Dataverse ${method} ${url.slice(api.length).split('?')[0]}: ${detail ?? `HTTP ${res.status}`}`)
      }
      return res
    }
  }
  return {
    async list(path) {
      const rows: Json[] = []
      let url: string | undefined = api + path
      while (url) {
        const res = await call('GET', url, undefined, { Prefer: 'odata.maxpagesize=5000,odata.include-annotations="Microsoft.Dynamics.CRM.lookuplogicalname"' })
        const page = (await res.json()) as { value: Json[]; '@odata.nextLink'?: string }
        rows.push(...page.value)
        url = page['@odata.nextLink']
      }
      return rows
    },
    async create(set, record) {
      await call('POST', api + set, record)
    },
    async update(set, id, changes) {
      // If-Match keeps a PATCH from creating a record that was deleted meanwhile.
      await call('PATCH', `${api}${set}(${id})`, changes, { 'If-Match': '*' })
    },
  }
}
