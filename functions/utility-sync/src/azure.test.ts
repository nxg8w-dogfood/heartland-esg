import { describe, expect, it } from 'vitest'
import { dataverse, keyVault, managedIdentity, type Fetch } from './azure'

function fake(answer: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; init?: RequestInit }[] = []
  const doFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return answer(String(input), init)
  }) as Fetch
  return { doFetch, calls }
}

const token = async (resource: string) => `token-for-${resource}`

describe('the Function’s Azure clients', () => {
  it('gets a managed identity token once per resource, with the identity header', async () => {
    const { doFetch, calls } = fake(() => Response.json({ access_token: 'abc', expires_on: String(Math.floor(Date.now() / 1000) + 3600) }))
    const get = managedIdentity(doFetch, { IDENTITY_ENDPOINT: 'http://localhost:8081/msi/token', IDENTITY_HEADER: 'h' })
    expect(await get('https://vault.azure.net')).toBe('abc')
    expect(await get('https://vault.azure.net')).toBe('abc')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('http://localhost:8081/msi/token?resource=https%3A%2F%2Fvault.azure.net&api-version=2019-08-01')
    expect(calls[0].init?.headers).toEqual({ 'X-IDENTITY-HEADER': 'h' })
  })

  it('says what to do when the app has no identity', async () => {
    await expect(managedIdentity(fake(() => new Response()).doFetch, {})('x')).rejects.toThrow('system-assigned identity')
  })

  it('reads a secret, and treats a missing one as no token', async () => {
    const { doFetch, calls } = fake((url) => (url.includes('/secrets/eloverblik-a') ? Response.json({ value: 'refresh' }) : new Response('{}', { status: 404 })))
    const secret = keyVault(doFetch, token, 'https://kv-example.vault.azure.net/')
    expect(await secret('eloverblik-a')).toBe('refresh')
    expect(await secret('varmeoverblik-a')).toBeNull()
    expect(calls[0].url).toBe('https://kv-example.vault.azure.net/secrets/eloverblik-a?api-version=7.4')
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer token-for-https://vault.azure.net')
  })

  it('follows Dataverse paging and asks for the owner’s table', async () => {
    const { doFetch, calls } = fake((url) =>
      url.includes('page2')
        ? Response.json({ value: [{ id: 2 }] })
        : Response.json({ value: [{ id: 1 }], '@odata.nextLink': 'https://org.crm4.dynamics.com/api/data/v9.2/hlesg_maalers?page2' }),
    )
    const dv = dataverse(doFetch, token, 'https://org.crm4.dynamics.com')
    expect(await dv.list('hlesg_maalers?$select=hlesg_adresse')).toEqual([{ id: 1 }, { id: 2 }])
    expect((calls[0].init?.headers as Record<string, string>).Prefer).toContain('lookuplogicalname')
  })

  it('retries after the Retry-After Dataverse gives, and updates without creating', async () => {
    let n = 0
    const waited: number[] = []
    const { doFetch, calls } = fake(() => (n++ === 0 ? new Response('{}', { status: 429, headers: { 'Retry-After': '2' } }) : new Response(null, { status: 204 })))
    const dv = dataverse(doFetch, token, 'https://org.crm4.dynamics.com', async (ms) => { waited.push(ms) })
    await dv.update('hlesg_maalers', 'id-1', { hlesg_fejl: null })
    expect(waited).toEqual([2000])
    expect(calls[1].url).toBe('https://org.crm4.dynamics.com/api/data/v9.2/hlesg_maalers(id-1)')
    expect((calls[1].init?.headers as Record<string, string>)['If-Match']).toBe('*')
  })

  it("reports Dataverse's own message", async () => {
    const { doFetch } = fake(() => Response.json({ error: { message: 'Principal user is missing prvCreatehlesg_linje' } }, { status: 403 }))
    await expect(dataverse(doFetch, token, 'https://org.crm4.dynamics.com').create('hlesg_linjes', {})).rejects.toThrow('prvCreatehlesg_linje')
  })
})
