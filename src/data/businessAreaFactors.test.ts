import { describe, expect, it } from 'vitest'
import { investmentFactors } from '../calc/investments'
import { businessAreaFactors, companyFactors, importedFactorId } from './businessAreaFactors'
import { factors } from './factors'

describe('businessAreaFactors', () => {
  it('only points to spend factors per EUR, which category 15 offers', () => {
    const offered = new Set(investmentFactors(factors).map((f) => f.id))
    const ids = [...Object.values(businessAreaFactors), ...Object.values(companyFactors).map((c) => c.factorId)]
    for (const id of ids) if (id !== null) expect(offered, id).toContain(id)
  })
})

describe('importedFactorId', () => {
  it('gives a holding its business area’s sector, whatever the case', () => {
    expect(importedFactorId({ organizationId: '999', businessArea: 'SaaS' })).toBe('f-exio-computer')
    expect(importedFactorId({ organizationId: null, businessArea: 'farming & forestry ' })).toBe('f-exio-crops')
  })

  it('uses a company’s own sector and home country where it differs from its area', () => {
    expect(importedFactorId({ organizationId: '401_464', businessArea: 'Apparel' })).toBe('f-exio-retail-de')
    expect(importedFactorId({ organizationId: '492-189', businessArea: 'FinTech' })).toBe('f-exio-finance-se')
    expect(importedFactorId({ organizationId: '564', businessArea: 'Apparel' })).toBe('f-exio-apparel-dk')
  })

  it('leaves the choice to the ESG owner where the sector isn’t clear', () => {
    expect(importedFactorId({ organizationId: '638', businessArea: 'Farming & Forestry' })).toBeNull()
    expect(importedFactorId({ organizationId: '659', businessArea: 'Transportation' })).toBeNull()
    expect(importedFactorId({ organizationId: '157', businessArea: '' })).toBeNull()
    expect(importedFactorId({ organizationId: '1', businessArea: 'Pottery' })).toBeNull()
  })
})
