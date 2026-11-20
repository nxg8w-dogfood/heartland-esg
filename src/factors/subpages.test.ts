import { expect, it } from 'vitest'
import { factorsHref, factorsSubpageFromHash } from './subpages'
import { pageFromHash } from '../pages'

it('gives index regulation its own address under Faktorer', () => {
  expect(factorsHref('indeksregulering')).toBe('#/faktorer/indeksregulering')
  expect(pageFromHash('#/faktorer/indeksregulering')).toBe('faktorer')
  expect(factorsSubpageFromHash('#/faktorer/indeksregulering')).toBe('indeksregulering')
  expect(factorsSubpageFromHash('#/faktorer')).toBe('faktorer')
  expect(factorsHref('faktorer')).toBe('#/faktorer')
})
