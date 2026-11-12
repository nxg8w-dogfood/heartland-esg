// The FaktorIDs the ESG owner's rules use (src/data/scope3Rules.ts), each mapped to a factor in
// the factor table and to the EXIOBASE sector it stands for (docs/adr/0009). Values live in the
// factor table only; a factor without a value leaves its postings pending.

export type RegisteredFactor = {
  /** FaktorID as written in the rule files, e.g. EXIO-OBS */
  code: string
  /** The factor in src/data/factors.ts */
  factorId: string
  /** Database the factor comes from */
  database: 'EXIOBASE' | 'BEIS'
  /** Sector (product) name */
  sector: string
  /** The data manual's full classification (sector, group, subgroup); empty when it doesn't name one */
  dataManual: string
}

export const spendFactorRegister: readonly RegisteredFactor[] = [
  { code: 'EXIO-OBS', factorId: 'f-exio-obs-dk', database: 'EXIOBASE', sector: 'Other Business Services', dataManual: 'Other Business Services, Organizational Activities, Professional Services' },
  { code: 'EXIO-COMP', factorId: 'f-exio-computer', database: 'EXIOBASE', sector: 'Computer and Related Services', dataManual: 'Computer and Related Services, Organizational Activities, Professional Services' },
  { code: 'EXIO-OFFM', factorId: 'f-exio-office', database: 'EXIOBASE', sector: 'Office Machinery and Computers', dataManual: 'Office Machinery and Computers, Equipment, Office Equipment' },
  { code: 'EXIO-POST', factorId: 'f-exio-post', database: 'EXIOBASE', sector: 'Post and Telecommunication', dataManual: 'Post and Telecommunication, Information and Communication, Information and Communication Services' },
  { code: 'EXIO-PRINT', factorId: 'f-exio-print', database: 'EXIOBASE', sector: 'Printed Matter and Recorded Media', dataManual: 'Printed Matter and Recorded Media, Consumers Goods and Services, Paper Products' },
  { code: 'EXIO-RETAIL', factorId: 'f-exio-retail', database: 'EXIOBASE', sector: 'Retail trade (except motor vehicles and motorcycles) and repair of personal and household goods', dataManual: 'Retail trade (except for motor vehicles and motorcycles) and repair of personal and household goods (services), Consumer Goods and Services, General Retail' },
  { code: 'EXIO-FOOD', factorId: 'f-exio-food', database: 'EXIOBASE', sector: 'Food products (not elsewhere specified)', dataManual: 'Foods products (not elsewhere specified), Consumer Goods and Services, Food/Beverages/Tobacco' },
  { code: 'EXIO-CONS', factorId: 'f-exio-construction', database: 'EXIOBASE', sector: 'Construction Work', dataManual: 'Construction Work, Buildings and Infrastructure, Construction' },
  { code: 'EXIO-FURN', factorId: 'f-exio-furniture', database: 'EXIOBASE', sector: 'Furniture/other manufactured goods (not elsewhere specified)', dataManual: 'Furniture/other manufactured goods (not elsewhere specified), Consumer Goods and Services, Furnishings and Household' },
  { code: 'EXIO-INS', factorId: 'f-exio-insurance', database: 'EXIOBASE', sector: 'Insurance and pension funding services', dataManual: 'Insurance and pension funding services (except compulsory social security services), Insurance and Financial Services, Insurance Services' },
  { code: 'EXIO-VEH', factorId: 'f-exio-vehicle-repair', database: 'EXIOBASE', sector: 'Sale, maintenance and repair of motor vehicles', dataManual: '' },
  { code: 'EXIO-AIR', factorId: 'f-exio-air', database: 'EXIOBASE', sector: 'Air transport services', dataManual: '' },
  { code: 'EXIO-HOTEL', factorId: 'f-exio-hotel', database: 'EXIOBASE', sector: 'Hotel and restaurant services', dataManual: '' },
  { code: 'EXIO-LAND', factorId: 'f-exio-land', database: 'EXIOBASE', sector: 'Other land transportation services', dataManual: '' },
  { code: 'EXIO-SEA', factorId: 'f-exio-sea', database: 'EXIOBASE', sector: 'Sea and coastal water transportation services', dataManual: '' },
  { code: 'EXIO-RAIL', factorId: 'f-exio-rail', database: 'EXIOBASE', sector: 'Railway transportation services', dataManual: '' },
  { code: 'BEIS-RENT', factorId: 'f-beis-rent', database: 'BEIS', sector: 'Leje af lokaler (rent)', dataManual: '' },
]

export const registeredFactor = (code: string | null): RegisteredFactor | null =>
  (code && spendFactorRegister.find((r) => r.code === code)) || null
