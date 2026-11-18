// The sector factor a category 15 holding gets when it's imported, from the company's business
// area in the group's consolidation system (docs/adr/0026). The data manual estimates a company
// without a climate account from a sector factor (ADR 0022), and the business area is the sector
// the cube gives. The factors have no values until the ESG owner enters them from EXIOBASE on the
// Faktorer page: they must not be guessed. Any holding's factor can be changed in the app.

/** By business area, as the cube writes it. null: no factor, the ESG owner chooses one in the app. */
export const businessAreaFactors: Readonly<Record<string, string | null>> = {
  'Apparel': 'f-exio-apparel-dk',
  'ApparelTech': 'f-exio-rnd',
  'Appliances': 'f-exio-electrical',
  'Discretionaries': 'f-exio-wholesale',
  'Education': 'f-exio-education',
  'Energy': 'f-exio-rnd',
  'Farming & Forestry': 'f-exio-crops',
  'Finance': 'f-exio-finance-dk',
  'FinTech': 'f-exio-finance-dk',
  'FMCG': 'f-exio-retail',
  'Furniture': 'f-exio-furniture',
  'Lodging': 'f-exio-hotel',
  'Q-Commerce': 'f-exio-retail',
  'Real Estate': 'f-exio-real-estate',
  'SaaS': 'f-exio-computer',
  'Space': 'f-exio-transport-equipment',
  'Sports': 'f-exio-recreation',
  'Sustainability': 'f-exio-rnd',
  // What these companies do isn't clear from the area.
  'Transportation': null,
  'VCF': 'f-exio-finance-dk',
}

/**
 * Companies whose sector differs from their business area's, by OrganizationID. The factor's
 * region is Denmark unless a large holding's home country has its own (decided 2026-11-18).
 */
export const companyFactors: Readonly<Record<string, { company: string; factorId: string | null }>> = {
  // Apparel retailers, not apparel makers
  '401_464': { company: 'Zalando', factorId: 'f-exio-retail-de' },
  '532': { company: 'About You', factorId: 'f-exio-retail-de' },
  '408': { company: 'ASOS', factorId: 'f-exio-retail-gb' },
  '726': { company: 'SportsGroup Denmark', factorId: 'f-exio-retail' },
  // FinTech in its home country
  '492-189': { company: 'Klarna', factorId: 'f-exio-finance-se' },
  '550': { company: 'Funding Circle', factorId: 'f-exio-finance-gb' },
  // Farming & Forestry that isn't crops
  '727': { company: 'Greenbeard Forestry', factorId: 'f-exio-forestry' },
  '496': { company: 'Grumeti', factorId: 'f-exio-hotel' },
  '640': { company: 'Singita Holdings', factorId: 'f-exio-hotel' },
  '639': { company: 'Singita Management', factorId: 'f-exio-hotel' },
  '638': { company: 'Castleton', factorId: null },
  '629': { company: 'Saphire', factorId: null },
}

/** The factor an imported holding starts with, or null when the ESG owner chooses one. */
export function importedFactorId(row: { organizationId: string | null; businessArea: string }): string | null {
  const company = row.organizationId ? companyFactors[row.organizationId] : undefined
  if (company) return company.factorId
  const area = Object.keys(businessAreaFactors).find((a) => a.toLowerCase() === row.businessArea.trim().toLowerCase())
  return area === undefined ? null : businessAreaFactors[area]
}
