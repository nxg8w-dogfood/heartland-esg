// Where the group's climate accounts are kept. The app talks to this interface only, so moving
// from the temporary browser store to Dataverse (docs/adr/0005, 0006) changes one
// implementation, not the app.

import { parseGroup, type GroupData, type GroupLoadResult } from './group'

export type GroupStore = {
  /** A short description for the UI, e.g. "denne browser" */
  readonly label: string
  /** Whether the data is shared and kept centrally, or only local */
  readonly central: boolean
  /** null when nothing has been saved yet */
  load(): Promise<GroupLoadResult | null>
  save(group: GroupData): Promise<void>
  clear(): Promise<void>
}

// The key predates groups; a single account saved under it loads as the group's first company.
const KEY = 'heartland-esg:account'

/**
 * TEMPORARY: keeps the group in this browser's localStorage, until Dataverse exists. Data
 * is not shared, not backed up and lost if the browser's site data is cleared. Every access
 * can fail (private windows, blocked storage, a full quota), so failures are reported, not
 * thrown at the app.
 */
export function browserStore(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = safeLocalStorage()): GroupStore {
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
        return parseGroup(JSON.parse(raw))
      } catch {
        return { ok: false, error: 'De gemte data kunne ikke læses.' }
      }
    },
    async save(group) {
      if (!storage) throw new Error('Browserens lager er ikke tilgængeligt.')
      storage.setItem(KEY, JSON.stringify(group))
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
