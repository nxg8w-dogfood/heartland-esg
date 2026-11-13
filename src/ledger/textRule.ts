import type { Rule } from '../calc/ledger'
import { newId } from '../newId'

/**
 * A new exception rule for postings whose text contains `text`, as made from a posting on
 * Kontoplan. It starts as "include with factor" without a factor, so the user picks one.
 */
export function textRule(text: string, category: number | null): Rule {
  const value = text.trim()
  return {
    id: newId(),
    name: `Posteringstekst: ${value}`,
    type: 'tag',
    active: true,
    conditions: [{ id: newId(), field: 'text', operator: 'contains', value }],
    factorId: null,
    category: category ?? 1,
    reason: '',
  }
}
