// Which store the app uses: Dataverse when it runs inside Power Apps, where the user is signed in
// and the hlesg_ tables are its data sources (docs/adr/0005); the browser draft otherwise, for
// local development with `npm run dev`.

import { getContext } from '@microsoft/power-apps/app'
import type { ViewPrefs } from './dataverse/store'
import { browserStore, type GroupStore } from './store'

/** How long to wait for the Power Apps host to answer before reporting it */
const HOST_TIMEOUT_MS = 15_000

/**
 * Where the app runs. Power Apps runs a code app in a frame; a page that isn't framed, like
 * `npm run dev` opened directly, runs on its own. A framed app must reach Dataverse or say it
 * can't: falling back to the browser would look saved while nothing is shared.
 */
async function host(): Promise<'standalone' | { environmentId: string }> {
  if (window.self === window.top) return 'standalone'
  const started = Date.now()
  let context
  try {
    context = await Promise.race([
      getContext(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Power Apps svarede ikke inden for ${HOST_TIMEOUT_MS / 1000} sekunder.`)), HOST_TIMEOUT_MS)),
    ])
  } catch (e) {
    console.error('[heartland-esg] Power Apps host:', e)
    throw new Error(`Appen kører i Power Apps, men kunne ikke forbinde til Dataverse: ${e instanceof Error ? e.message : String(e)} Prøv at genindlæse siden.`, { cause: e })
  }
  console.info('[heartland-esg] Power Apps host answered after', Date.now() - started, 'ms:', { environmentId: context?.app?.environmentId, appId: context?.app?.appId })
  if (!context?.app?.environmentId) throw new Error('Appen kører i Power Apps, men kender ikke sit miljø, så den kan ikke forbinde til Dataverse. Prøv at genindlæse siden.')
  return { environmentId: context.app.environmentId }
}

const VIEW_KEY = 'heartland-esg:view'

/** The user's view (open company, summary period), per browser. Failing storage is ignored. */
export const localViewPrefs: ViewPrefs = {
  read() {
    try {
      const raw = window.localStorage.getItem(VIEW_KEY)
      return raw ? (JSON.parse(raw) as ReturnType<ViewPrefs['read']>) : {}
    } catch {
      return {}
    }
  },
  write(view) {
    try {
      window.localStorage.setItem(VIEW_KEY, JSON.stringify(view))
    } catch {
      // The view is a convenience; losing it is harmless.
    }
  },
}

/** Dataverse inside Power Apps, the browser draft on its own. Throws if Power Apps doesn't answer. */
export async function chooseStore(): Promise<GroupStore> {
  if ((await host()) === 'standalone') return browserStore()
  const [{ dataverseStore }, { generatedApi }] = await Promise.all([import('./dataverse/store'), import('./dataverse/generated')])
  return dataverseStore(generatedApi(), localViewPrefs)
}
