// Where the account is kept. The app talks to this interface only, so moving from the
// temporary browser store to Dataverse (docs/adr/0005) changes one implementation, not the app.

import { parseAccount, type AccountData, type LoadResult } from './account'

export type AccountStore = {
  /** A short description for the UI, e.g. "denne browser" */
  readonly label: string
  /** Whether the data is shared and kept centrally, or only local */
  readonly central: boolean
  /** null when nothing has been saved yet */
  load(): Promise<LoadResult | null>
  save(account: AccountData): Promise<void>
  clear(): Promise<void>
}

const KEY = 'heartland-esg:account'

/**
 * TEMPORARY: keeps the account in this browser's localStorage, until Dataverse exists. Data
 * is not shared, not backed up and lost if the browser's site data is cleared. Every access
 * can fail (private windows, blocked storage, a full quota), so failures are reported, not
 * thrown at the app.
 */
export function browserStore(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = safeLocalStorage()): AccountStore {
  return {
    label: 'denne browser',
    central: false,
    async load() {
      if (!storage) return { ok: false, error: 'Browserens lager er ikke tilgængeligt. Data gemmes ikke.' }
      let raw: string | null
      try {
        raw = storage.getItem(KEY)
      } catch {
        return { ok: false, error: 'Browserens lager kunne ikke læses. Data gemmes ikke.' }
      }
      if (raw === null) return null
      try {
        return parseAccount(JSON.parse(raw))
      } catch {
        return { ok: false, error: 'De gemte data kunne ikke læses.' }
      }
    },
    async save(account) {
      if (!storage) throw new Error('Browserens lager er ikke tilgængeligt.')
      storage.setItem(KEY, JSON.stringify(account))
    },
    async clear() {
      storage?.removeItem(KEY)
    },
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}
