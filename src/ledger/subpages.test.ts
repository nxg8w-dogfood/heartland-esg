import { describe, expect, it } from 'vitest'
import { ledgerHref, ledgerSubpageFromHash, ledgerSubpages } from './subpages'

describe('Kontoplan sub-pages', () => {
  it('has Posteringer, Regler and Undtagelser, with Posteringer at Kontoplan\'s own address', () => {
    expect(ledgerSubpages.map((p) => p.label)).toEqual(['Posteringer', 'Regler', 'Undtagelser'])
    expect(ledgerSubpages.map((p) => ledgerHref(p.id))).toEqual(['#/kontoplan', '#/kontoplan/regler', '#/kontoplan/undtagelser'])
  })

  it('reads the sub-page from the address, falling back to Posteringer', () => {
    expect(ledgerSubpageFromHash('#/kontoplan/regler')).toBe('regler')
    expect(ledgerSubpageFromHash('#/kontoplan/undtagelser')).toBe('undtagelser')
    expect(ledgerSubpageFromHash('#/kontoplan')).toBe('posteringer')
    expect(ledgerSubpageFromHash('#/kontoplan/ukendt')).toBe('posteringer')
  })
})
