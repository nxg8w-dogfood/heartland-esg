// Which store the app uses: Dataverse when it runs inside Power Apps, where the user is signed in
// and the hlesg_ tables are its data sources (docs/adr/0005); the browser draft otherwise, for
// local development with `npm run dev`.

import { getContext } from '@microsoft/power-apps/app'
import type { ViewPrefs } from './dataverse/store'
import { browserStore, type GroupStore } from './store'

/** How long to wait for the Power Apps host before deciding the app runs on its own */
const HOST_TIMEOUT_MS = 4000

async function inPowerApps(): Promise<boolean> {
  // Power Apps runs a code app in a frame. A page that isn't framed, like `npm run dev` opened
  // directly, can't be in Power Apps, and the host would never answer, so don't wait for it.
  if (window.self === window.top) return false
  try {
    const context = await Promise.race([
      getContext(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), HOST_TIMEOUT_MS)),
    ])
    return !!context?.app?.environmentId
  } catch {
    return false
  }
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

export async function chooseStore(): Promise<GroupStore> {
  if (!(await inPowerApps())) return browserStore()
  const [{ dataverseStore }, { generatedApi }] = await Promise.all([import('./dataverse/store'), import('./dataverse/generated')])
  return dataverseStore(generatedApi(), localViewPrefs)
}
