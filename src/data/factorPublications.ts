// Official publications that can replace the built-in value of a factor. Every value here was
// read from the primary document linked, on the date given, and is copied exactly (converted
// from g to kg CO2e per unit). Nothing is estimated.

export type FactorPublication = {
  id: string
  /** Shown as the source when chosen */
  name: string
  publisher: string
  /** When the publisher issued it */
  published: string
  url: string
  /** Read by the team on */
  checked: string
  note: string
  /** Factor id → value in the factor's unit */
  values: Record<string, number>
}

const g = (gPerKWh: number) => Math.round(gPerKWh * 1e6) / 1e9

export const factorPublications: readonly FactorPublication[] = [
  {
    id: 'ens-el-emissionsfaktoren-2025-2035',
    name: 'Energistyrelsen, El-emissionsfaktoren (2025-2035)',
    publisher: 'Energistyrelsen',
    published: '2025-09-24',
    url: 'https://ens.dk/media/7359/download',
    checked: '2026-09-30',
    note: 'Opdateret fremskrivning (KF25, frozen policy), DK samlet. Afløser udgaven fra 10.09.2024, som den indbyggede tabel bruger. Kun forbrænding: uden well-to-tank og biogene udledninger.',
    values: {
      'f-s2-el-dk-2025': g(74.7),
      'f-s2-el-dk-2026': g(63.3),
      'f-s2-el-dk-2027': g(52.4),
      'f-s2-el-dk-2028': g(43.3),
      'f-s2-el-dk-2029': g(35.3),
      'f-s2-el-dk-2030': g(32.4),
      'f-s2-el-dk-2031': g(29.7),
      'f-s2-el-dk-2032': g(28.7),
      'f-s2-el-dk-2033': g(28.3),
      'f-s2-el-dk-2034': g(28.7),
      'f-s2-el-dk-2035': g(28.4),
    },
  },
  {
    id: 'energinet-generel-eldeklaration-2025',
    name: 'Energinet, Generelle Eldeklaration 2025 (med revision)',
    publisher: 'Energinet',
    published: '2026-08-11',
    url: 'https://energinet.dk/media/wpdb2bf3/generel-eldeklaration-2025-med-revision.pdf',
    checked: '2026-09-30',
    note: 'Drivhusgasser (CO2 ækv.) 348,07 g/kWh. Den market-based deklaration efter GHG-protokollen for forbrugere uden køb af oprindelsesgarantier.',
    values: {
      'f-s2-el-residual-2025': g(348.07),
    },
  },
]
