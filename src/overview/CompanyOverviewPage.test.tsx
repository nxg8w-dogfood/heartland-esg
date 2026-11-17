import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { companyOverview } from '../calc/companyOverview'
import { factors } from '../data/factors'
import { pageFromHash } from '../pages'
import { emptyAccount } from '../storage/account'
import { CompanyOverviewPage } from './CompanyOverviewPage'
import { DrillChart } from './DrillChart'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }

const withWaste = () => ({
  ...emptyAccount(),
  cat5Lines: [{ id: 'w', group: 'k5-erhverv-forbr', date: '2025-05-01', dateTo: '2025-05-31', quantity: 2 }],
})

describe('CompanyOverviewPage', () => {
  it('is the page a company opens on', () => {
    expect(pageFromHash('')).toBe('oversigt')
    expect(pageFromHash('#/oversigt')).toBe('oversigt')
    expect(pageFromHash('#/ukendt')).toBe('oversigt')
  })

  it('shows the three scopes and all 15 categories, with links to their pages', () => {
    const html = renderToStaticMarkup(<CompanyOverviewPage account={emptyAccount()} factors={factors} period={year2025} />)
    expect(html).toContain('<h1>Oversigt</h1>')
    for (const href of ['#/scope1', '#/scope2', '#/scope3', '#/scope3/kategori-5']) expect(html).toContain(`href="${href}"`)
    expect(html).toContain('14 — Franchises')
    expect(html).toContain('beregnes ikke i appen endnu')
  })

  it('lists what makes the figures incomplete', () => {
    const a = emptyAccount()
    a.relevance = { ...a.relevance, 8: { relevant: true, reason: '' } }
    const html = renderToStaticMarkup(<CompanyOverviewPage account={a} factors={factors} period={year2025} />)
    expect(html).toContain('Ufuldstændig')
    expect(html).toContain('beregnes ikke i appen endnu')
  })
})

describe('DrillChart', () => {
  const tree = companyOverview(withWaste(), factors, year2025).tree

  it('starts with the three scopes as buttons that drill in', () => {
    const html = renderToStaticMarkup(<DrillChart tree={tree} selected="" onSelect={() => {}} months={[]} />)
    expect(html).toContain('aria-label="Scope 3, vis fordeling"')
    expect(html).toContain('<span aria-current="location">I alt</span>')
  })

  it('shows the path back up and the parts of a category', () => {
    const html = renderToStaticMarkup(<DrillChart tree={tree} selected="s3/5" onSelect={() => {}} months={[]} />)
    expect(html).toMatch(/<button[^>]*>I alt<\/button>.*<button[^>]*>Scope 3<\/button>/)
    expect(html).toContain('<span aria-current="location">5 — Affald genereret i driften</span>')
    expect(html).toContain('href="#/scope3/kategori-5"')
    expect(html).toContain('<caption class="visually-hidden">5 — Affald genereret i driften fordelt</caption>')
  })

  it('draws a column per month with its value for screen readers', () => {
    const months = [{ label: 'jan 2025', start: '2025-01-01', value: 1 }, { label: 'feb 2025', start: '2025-02-01', value: 2 }]
    const html = renderToStaticMarkup(<DrillChart tree={tree} selected="" onSelect={() => {}} months={months} />)
    expect(html).toContain('aria-label="feb 2025: 2,000 tCO2e"')
    expect(html).toContain('height:100%')
  })
})
