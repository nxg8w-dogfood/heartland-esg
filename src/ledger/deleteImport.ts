// What the delete dialog on Kontoplan asks before an import and its postings go.

import { formatNumber } from '../format'

/**
 * The count is the postings actually in the ledger, not the import's own `count`: after a save
 * that was cut short, fewer rows exist than the file held, and the dialog must name what will
 * really be deleted.
 */
export function deleteImportQuestion(fileName: string, count: number): string {
  return `Slet importen ${fileName} og dens ${formatNumber(count, 0)} ${count === 1 ? 'postering' : 'posteringer'}?`
}
