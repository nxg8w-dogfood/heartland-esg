// Whether the group is saved, and what to say about it. Shared by the data bar and the save
// indicator, so both say the same thing.

import { formatNumber } from '../format'

export type SaveStatus =
  | { state: 'idle' }
  /** done and total: how many of a long save's changes are sent */
  | { state: 'pending'; done?: number; total?: number }
  | { state: 'saved'; at: Date }
  | { state: 'failed'; reason?: string }

/** From how many changes a save shows its progress (an import is thousands). */
export const LONG_SAVE = 50

/** What the status says, or '' when there's nothing to say. */
export function saveStatusText(status: SaveStatus): string {
  switch (status.state) {
    case 'pending':
      return status.total && status.total > LONG_SAVE
        ? `Gemmer ${formatNumber(status.done ?? 0, 0)} af ${formatNumber(status.total, 0)} ændringer … Luk ikke appen, før det er gemt.`
        : 'Gemmer …'
    case 'saved': return `Gemt kl. ${status.at.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
    case 'failed': return `Kunne ikke gemme${status.reason ? `: ${status.reason}` : ''}`
    case 'idle': return ''
  }
}
