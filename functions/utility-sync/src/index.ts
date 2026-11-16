// The nightly utility sync (ADR 0021), as an Azure Function on a timer. The work itself is in
// src/sync/utilitySync.ts; this file connects it to the managed identity, Key Vault and Dataverse.
//
// App settings (infra/utility-sync/main.bicep): DATAVERSE_URL, KEY_VAULT_URL.

import { app, type InvocationContext, type Timer } from '@azure/functions'
import { randomUUID } from 'node:crypto'
import { syncAll } from '../../../src/sync/utilitySync'
import { dataverse, keyVault, managedIdentity } from './azure'

function setting(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`The app setting ${name} is missing.`)
  return value
}

export async function utilitySync(_timer: Timer, context: InvocationContext): Promise<void> {
  const doFetch: typeof fetch = (input, init) => fetch(input, init)
  const token = managedIdentity(doFetch)
  const { results, failures } = await syncAll({
    dataverse: dataverse(doFetch, token, setting('DATAVERSE_URL')),
    secret: keyVault(doFetch, token, setting('KEY_VAULT_URL')),
    fetch: doFetch,
    now: () => Date.now(),
    newId: () => randomUUID(),
    log: (message) => context.log(message),
  })
  const lines = results.reduce((n, r) => n + r.lines, 0)
  context.log(`Done: ${results.length} companies with tokens, ${lines} new lines, ${failures.length} failed.`)
  // A failed company fails the run, so it shows in Application Insights and its alert.
  if (failures.length) throw new Error(`The sync failed for ${failures.length} companies: ${failures.join(' | ')}`)
}

// 02:00 UTC every day; run it by hand from the portal (Code + Test) or the admin endpoint.
app.timer('utilitySync', { schedule: '0 0 2 * * *', handler: utilitySync })
