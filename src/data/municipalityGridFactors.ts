// The location-based electricity factor per municipality as factors, one family per
// municipality, one factor per year (docs/adr/0031). A municipality has no factor for a year
// without a figure; its location then uses the price area's.

import type { Factor } from './factors'
import { MUNICIPALITY_GRID_FETCHED, municipalityGridValues, municipalityGridYears } from './municipalityGrid'
import { municipalities } from './municipalities'

export const MUNICIPALITY_GRID_SOURCE = 'Energinet, Miljødeklaration per kommune (125 %-metoden)'

/** The factor family holding one municipality's yearly grid mix */
export const municipalityGridFamily = (code: string) => `el-kommune-${code}-location`

export const isMunicipalityGrid = (f: Factor) => /^el-kommune-\d+-location$/.test(f.family ?? '')

export const municipalityGridFactors: readonly Factor[] = municipalities.flatMap((m) =>
  municipalityGridYears.flatMap((year, i): Factor[] => {
    const g = municipalityGridValues[m.code]?.[i]
    if (g == null) return []
    return [{
      id: `f-s2-el-kommune-${m.code}-${year}`,
      scope: 'Scope 2',
      category: 'El (location-based, kommune)',
      name: `Elmiks ${m.name}`,
      region: `${m.name} (${m.priceArea})`,
      unit: 'kg CO2e/kWh',
      value: Math.round(g * 100) / 100000,
      source: MUNICIPALITY_GRID_SOURCE,
      reference: `Beregnet fra Energi Data Service (ReCoverageMunicipality × DeclarationTransmissionEmission, 125 %), kommune ${m.code}, ${year}, hentet ${MUNICIPALITY_GRID_FETCHED}. Svarer til arket »Miljødeklaration per kommune« i Energinets Miljødeklaration, årsgennemsnit.`,
      family: municipalityGridFamily(m.code),
      validFrom: `${year}-01-01`,
      validTo: `${year}-12-31`,
      note: `Energinets lokationsbaserede deklaration for ${m.name} ${year}: forbrugsvægtet årsgennemsnit, hvor lokalt produceret vedvarende energi trækkes fra. Kun forbrænding. Bruges for lokationer i kommunen.`,
    }]
  }),
)
