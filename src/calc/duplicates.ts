// Spotting ledger postings that are already imported, so that importing a file again, or two
// exports that overlap, doesn't count the same posting twice. Several imports in one period are
// fine: a new import adds to the postings, it never replaces them.

import type { Posting } from './ledger'

type PostingFields = Omit<Posting, 'id' | 'importId'>

/**
 * What makes two postings the same: date, account, supplier, text, amount and currency. Case and
 * spacing around the text are ignored; the account name isn't compared, as exports name an
 * account differently over time.
 */
export const postingKey = (p: PostingFields) =>
  [p.date, p.account.trim(), p.supplier.trim().toLowerCase(), p.text.trim().toLowerCase(), p.amount === null ? '' : p.amount.toFixed(2), p.currency.trim().toUpperCase()].join('\u0001')

/**
 * Which of the new rows are already among the existing postings, by index. Matched one for one:
 * two identical rows in a file against one existing posting make one duplicate, since two equal
 * fees on the same day can both be real.
 */
export function alreadyImported(rows: readonly PostingFields[], existing: readonly PostingFields[]): Set<number> {
  const left = new Map<string, number>()
  for (const p of existing) left.set(postingKey(p), (left.get(postingKey(p)) ?? 0) + 1)
  const found = new Set<number>()
  rows.forEach((r, i) => {
    const k = postingKey(r)
    const n = left.get(k) ?? 0
    if (n > 0) {
      found.add(i)
      left.set(k, n - 1)
    }
  })
  return found
}
