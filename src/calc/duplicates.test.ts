import { describe, expect, it } from 'vitest'
import { alreadyImported, postingKey } from './duplicates'

const p = (o: Partial<Parameters<typeof postingKey>[0]> = {}) => ({
  date: '2025-01-15', account: '6100', accountName: 'Revision', supplier: 'Deloitte', text: 'Revision 2024', amount: 185_000, currency: 'DKK', ...o,
})

describe('alreadyImported', () => {
  it('finds rows matching an existing posting on date, account, supplier, text, amount and currency', () => {
    const existing = [p(), p({ text: 'Halvårsgennemgang', amount: 45_000 })]
    const rows = [p(), p({ date: '2025-01-16' }), p({ amount: 185_000.01 }), p({ currency: 'EUR' }), p({ supplier: 'PwC' }), p({ account: '6110' })]
    expect([...alreadyImported(rows, existing)]).toEqual([0])
  })

  it('ignores case and spacing in the text, and the account name', () => {
    expect([...alreadyImported([p({ text: ' revision 2024 ', supplier: 'DELOITTE', accountName: 'Revisor', currency: 'dkk' })], [p()])]).toEqual([0])
  })

  it('matches one for one, so a second identical row in the file is new', () => {
    expect([...alreadyImported([p(), p()], [p()])]).toEqual([0])
    expect([...alreadyImported([p(), p()], [p(), p()])]).toEqual([0, 1])
  })

  it('finds nothing in a first import', () => {
    expect(alreadyImported([p(), p()], []).size).toBe(0)
  })

  it('compares unreadable amounts as equal', () => {
    expect([...alreadyImported([p({ amount: null })], [p({ amount: null })])]).toEqual([0])
  })
})
