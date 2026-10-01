import type { ImportBatch, ManualAction, Posting, Rule } from '../calc/ledger'

/** Everything the Kontoplan screen holds. In memory for now; Dataverse later. */
export type LedgerState = {
  postings: Posting[]
  imports: ImportBatch[]
  rules: Rule[]
  /** The manual action per posting id; the latest one wins */
  manual: Record<string, ManualAction>
}

export const emptyLedger: LedgerState = { postings: [], imports: [], rules: [], manual: {} }
