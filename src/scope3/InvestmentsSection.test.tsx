import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { category15, type Investment } from '../calc/investments'
import { currencyRates } from '../data/currencies'
import { InvestmentsSection } from './InvestmentsSection'

const period = { start: '2026-01-01', end: '2026-12-31' }
const holding = (patch: Partial<Investment>): Investment => ({
  id: 'inv-1', date: '2026-07-31', company: 'Delejet ApS', ownershipPct: 40, accountingMethod: 'Other investments',
  climateMethod: 'Investment-specific method', dataSource: 'Koncernsystem, July 2026', basis: 'CO2e', totalKgCO2e: 1_000_000,
  revenueDKK: null, revenueLocal: null, localCurrency: 'DKK', rateLocalToDKK: null, factorKgPerEUR: null, factorSource: '', country: '',
  ...patch,
})

const render = (investments: Investment[]) => renderToStaticMarkup(
  <InvestmentsSection cat15={category15(investments, currencyRates, period)} investments={investments} setInvestments={() => {}} period={period} />,
)

describe('InvestmentsSection', () => {
  it('folds each holding to one line with its name, year, ownership and tCO2e', () => {
    const html = render([holding({})])
    expect(html).toContain('<details class="card investment-details">')
    expect(html).toMatch(/<summary><span class="investment-name">Delejet ApS<\/span><span class="muted"> · 2026 · 40,00 % · 400,000 tCO2e<\/span><\/summary>/)
  })

  it('says in the folded line what is missing', () => {
    expect(render([holding({ basis: 'Revenue', totalKgCO2e: null, revenueDKK: 5_000_000 })])).toMatch(/<summary>.*· Mangler data<\/span><\/summary>/)
  })

  it('opens a new, empty holding so it can be filled in', () => {
    expect(render([holding({ company: '' })])).toContain('<details class="card investment-details" open="">')
  })
})
