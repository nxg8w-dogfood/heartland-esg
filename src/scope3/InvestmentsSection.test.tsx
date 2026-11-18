import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { category15, type Investment } from '../calc/investments'
import { currencyRates } from '../data/currencies'
import { factors } from '../data/factors'
import { InvestmentsSection } from './InvestmentsSection'

// Heartland's fiscal year; the holdings are dated on its last day, as the import dates them.
const period = { start: '2025-08-01', end: '2026-07-31' }
const holding = (patch: Partial<Investment>): Investment => ({
  id: 'inv-1', date: '2026-07-31', company: 'Delejet ApS', ownershipPct: 40, accountingMethod: 'Other investments',
  climateMethod: 'Investment-specific method', dataSource: 'Koncernsystem, July 2026', basis: 'CO2e', totalKgCO2e: 1_000_000,
  revenueDKK: null, revenueLocal: null, localCurrency: 'DKK', rateLocalToDKK: null, investmentDKK: null, factorKgPerEUR: null, factorSource: '', country: '',
  ...patch,
})

const render = (investments: Investment[]) => renderToStaticMarkup(
  <InvestmentsSection cat15={category15(investments, currencyRates, period, factors)} investments={investments} setInvestments={() => {}} period={period} factors={factors} />,
)
const onRevenue = (patch: Partial<Investment> = {}) => holding({ basis: 'Revenue', totalKgCO2e: null, revenueDKK: 7_460_400, ...patch })
const onAmount = (patch: Partial<Investment> = {}) => holding({ basis: 'Investment', totalKgCO2e: null, investmentDKK: 7_460_400, ...patch })

describe('InvestmentsSection', () => {
  it('folds each holding to one line with its name, year, ownership and tCO2e', () => {
    const html = render([holding({})])
    expect(html).toContain('<details class="card investment-details">')
    expect(html).toMatch(/<summary><span class="investment-name">Delejet ApS<\/span><span class="muted"> · 2025\/26 · 40,00 % · 400,000 tCO2e<\/span><\/summary>/)
  })

  it('shows an imported holding’s OrganizationID and business area', () => {
    expect(render([holding({ organizationId: '401_464', businessArea: 'Apparel' })])).toContain('<p class="muted">OrganizationID 401_464 · Forretningsområde: Apparel</p>')
    expect(render([holding({})])).not.toContain('Forretningsområde:')
  })

  it('says in the folded line what is missing', () => {
    expect(render([onRevenue()])).toMatch(/<summary>.*· Faktor mangler<\/span><\/summary>/)
  })

  it('offers the spend factors per EUR, and a factor of its own', () => {
    const html = render([onRevenue()])
    expect(html).toContain('>Egen faktor</option>')
    expect(html).toContain('<option value="f-exio-obs-se">Other business services (Sverige) · 0,0768</option>')
    expect(html).not.toContain('kg CO2e/GBP')
    expect(html).toContain('Egen faktor (kg CO2e pr. EUR)')
  })

  it('counts with the chosen factor, and points to the Faktorer page when its value is missing', () => {
    // 7.460.400 DKK = 1.000.000 EUR × 0,0768 × 40 % = 30,72 t for the whole year
    expect(render([onRevenue({ factorId: 'f-exio-obs-se' })])).toContain('30,720 tCO2e</span></summary>')
    const missing = render([onRevenue({ factorId: 'f-exio-computer' })])
    expect(missing).toContain('· Faktorens værdi mangler</span></summary>')
    expect(missing).toContain('Faktorens værdi mangler — angiv den på Faktorer-siden')
  })

  it('offers one factor for every estimated holding without one', () => {
    const html = render([onRevenue({ id: 'a' }), onRevenue({ id: 'b' }), onRevenue({ id: 'c', factorId: 'f-exio-obs-se' }), holding({ id: 'd' }), onAmount({ id: 'e' })])
    expect(html).toContain('Faktor til investeringer uden faktor')
    expect(html).toContain('Brug på 3 investeringer')
    expect(render([holding({})])).not.toContain('Faktor til investeringer uden faktor')
  })

  it('opens a new, empty holding so it can be filled in', () => {
    expect(render([holding({ company: '' })])).toContain('<details class="card investment-details" open="">')
  })
})

describe('a holding on the investment amount', () => {
  it('takes the amount and a factor, and counts amount × factor without the ownership share', () => {
    // 7.460.400 DKK = 1.000.000 EUR × 0,0768 = 76,8 t
    const html = render([onAmount({ factorId: 'f-exio-obs-se' })])
    expect(html).toContain('<option value="Investment" selected="">Investeringsbeløb × faktor</option>')
    expect(html).toContain('Investeringsbeløb (DKK)')
    expect(html).toContain('Investeret 1.000.000 EUR')
    expect(html).toContain('76,800 tCO2e</span></summary>')
  })

  it('says what is missing', () => {
    expect(render([onAmount({ investmentDKK: null })])).toContain('· Investeringsbeløb mangler</span></summary>')
    expect(render([onAmount({ investmentDKK: -1 })])).toContain('· Investeringsbeløbet er negativt — tæller ikke med</span></summary>')
    expect(render([onAmount()])).toContain('· Faktor mangler</span></summary>')
  })
})

describe('Imported data', () => {
  it('lists each import with a button that deletes it', () => {
    const html = render([holding({}), holding({ id: 'inv-2', company: 'Andet ApS' }), holding({ id: 'inv-3', dataSource: 'Årsrapport' })])
    expect(html).toContain('<strong>July 2026</strong> fra koncernsystemet · 2 investeringer')
    expect(html).toContain('Slet<span class="visually-hidden"> importen July 2026</span></button>')
  })

  it('is left out when nothing was imported', () => {
    expect(render([holding({ dataSource: 'Årsrapport' })])).not.toContain('Importerede data')
  })
})
