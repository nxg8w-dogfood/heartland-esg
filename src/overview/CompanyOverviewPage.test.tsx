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
    const html = renderToStaticMarkup(<DrillChart tree={tree} locationTree={tree} selected="" onSelect={() => {}} months={[]} locationMonths={[]} />)
    expect(html).toContain('aria-label="Scope 3, vis fordeling"')
    expect(html).toContain('<span aria-current="location">I alt</span>')
  })

  it('shows the path back up and the parts of a category', () => {
    const html = renderToStaticMarkup(<DrillChart tree={tree} locationTree={tree} selected="s3/5" onSelect={() => {}} months={[]} locationMonths={[]} />)
    expect(html).toMatch(/<button[^>]*>I alt<\/button>.*<button[^>]*>Scope 3<\/button>/)
    expect(html).toContain('<span aria-current="location">5 — Affald genereret i driften</span>')
    expect(html).toContain('href="#/scope3/kategori-5"')
    expect(html).toContain('<caption class="visually-hidden">5 — Affald genereret i driften fordelt</caption>')
  })

  it('draws a column per month with its value for screen readers', () => {
    const months = [{ label: 'jan 2025', start: '2025-01-01', value: 1 }, { label: 'feb 2025', start: '2025-02-01', value: 2 }]
    const html = renderToStaticMarkup(<DrillChart tree={tree} locationTree={tree} selected="" onSelect={() => {}} months={months} locationMonths={months} />)
    expect(html).toContain('aria-label="feb 2025: 2,000 tCO2e"')
    expect(html).toContain('height:100%')
  })

  describe('with Scope 2', () => {
    const a = {
      ...emptyAccount(),
      locations: [{ id: 'hq', name: 'Storetorv 1', gridFamily: 'el-dk-location', marketInstrument: 'residualmiks' as const, heatingFactorId: 'f-s2-fjernvarme-beis' as const }],
      scope2Lines: [{ id: 'e', locationId: 'hq', kind: 'electricity' as const, date: '2025-01-01', dateTo: '2025-12-31', kWh: 100_000 }],
    }
    const market = companyOverview(a, factors, year2025, 'market').tree
    const location = companyOverview(a, factors, year2025, 'location').tree

    it('shows market-based and location-based side by side, with no method to choose', () => {
      const html = renderToStaticMarkup(<DrillChart tree={market} locationTree={location} selected="" onSelect={() => {}} months={[]} locationMonths={[]} />)
      expect(html).toContain('Market-based<span class="sub">tCO2e</span>')
      expect(html).toContain('Location-based<span class="sub">tCO2e</span>')
      expect(html).toContain('class="bar location"')
      expect(html).toMatch(/tCO2e market-based · <strong>[\d.,]+<\/strong> tCO2e location-based/)
      expect(html).not.toContain('type="radio"')
      expect(market.value).not.toBeCloseTo(location.value, 6)
    })

    it('keeps one column and one bar where the methods agree', () => {
      const html = renderToStaticMarkup(<DrillChart tree={market} locationTree={location} selected="s3" onSelect={() => {}} months={[]} locationMonths={[]} />)
      expect(html).not.toContain('Location-based')
      expect(html).not.toContain('class="bar location"')
    })

    it('draws the month by month figure once per method where they differ', () => {
      const months = [{ label: 'jan 2025', start: '2025-01-01', value: 1 }, { label: 'feb 2025', start: '2025-02-01', value: 2 }]
      const html = renderToStaticMarkup(<DrillChart tree={market} locationTree={location} selected="s2" onSelect={() => {}} months={months} locationMonths={months} />)
      expect(html).toContain('Scope 2, market-based, tCO2e')
      expect(html).toContain('Scope 2, location-based, tCO2e')
    })
  })
})
