import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import { pageFromHash } from '../pages'
import { emptyAccount } from '../storage/account'
import { CompanyOverviewPage } from './CompanyOverviewPage'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }

describe('CompanyOverviewPage', () => {
  it('is the page a company opens on', () => {
    expect(pageFromHash('')).toBe('oversigt')
    expect(pageFromHash('#/oversigt')).toBe('oversigt')
    expect(pageFromHash('#/ukendt')).toBe('oversigt')
  })

  it('shows the three scopes with links to their pages', () => {
    const html = renderToStaticMarkup(<CompanyOverviewPage account={emptyAccount()} factors={factors} period={year2025} />)
    expect(html).toContain('<h1>Oversigt</h1>')
    for (const href of ['#/scope1', '#/scope2', '#/scope3']) expect(html).toContain(`href="${href}"`)
    expect(html).toContain('href="#/scope3/kategori-5"')
    // No total to split, so no bar and no shares.
    expect(html).not.toContain('share-bar')
  })

  it('lists what makes the figures incomplete', () => {
    const a = emptyAccount()
    a.relevance = { ...a.relevance, 8: { relevant: true, reason: '' } }
    const html = renderToStaticMarkup(<CompanyOverviewPage account={a} factors={factors} period={year2025} />)
    expect(html).toContain('Ufuldstændig')
    expect(html).toContain('beregnes ikke i appen endnu')
  })
})
