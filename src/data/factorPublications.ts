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
  /** Factor id → where in the publication the value is, when it has many */
  rows?: Record<string, string>
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
  {
    id: 'desnz-ghg-conversion-factors-2026',
    name: 'DESNZ GHG Conversion Factors 2026',
    publisher: 'Department for Energy Security and Net Zero (UK)',
    published: '2026-06-11',
    url: 'https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2026',
    checked: '2026-10-01',
    note: 'Flat file, revideret juli 2026 (ghg-conversion-factors-2026-flat-format-revised.xlsx), kolonnen kg CO2e. Hver faktor er knyttet til den række i 2025-filen, der gav den indbyggede værdi, og værdien er taget fra samme række i 2026. "Incineration with Energy Recovery" hedder "Combustion" i 2026. Gælder alle linjer for faktoren, når den er valgt, så vælg den til regnskaber for 2026.',
    values: {
      'f-s1-diesel': 2.58354,
      'f-s1-benzin': 2.075,
      'f-s1-naturgas': 2.02633,
      'f-s1-gasolie': 2.75541,
      'f-s1-hfc134a': 1300,
      'f-s2-fjernvarme-beis': 0.17529,
      'f-k3-wtt-diesel': 0.61101,
      'f-k3-wtt-benzin': 0.58094,
      'f-k3-wtt-naturgas': 0.3366,
      'f-k3-wtt-gasolie': 0.62665,
      'f-k3-fjernvarme-td': 0.00945,
      'f-w-papir-dep': 1164.51317,
      'f-w-papir-gen': 4.65358,
      'f-w-trae-dep': 925.36725,
      'f-w-trae-gen': 4.65358,
      'f-w-plast-forbr': 4.65358,
      'f-w-plast-gen': 4.65358,
      'f-w-hush-forbr': 4.65358,
      'f-w-blandet-forbr': 4.65358,
      'f-w-blandet-gen': 4.65358,
      'f-w-andet-dep': 9.00687,
      'f-w-andet-gen': 4.65358,
      'f-t-fly-kort': 0.12786,
      'f-t-fly-lang': 0.15282,
      'f-t-fly-indenrigs': 0.22928,
      'f-t-bus': 0.12552,
      'f-t-tog': 0.03092,
      'f-t-taxi': 0.14861,
      'f-t-faerge': 0.1127,
      'f-t-bil-diesel': 0.17265,
      'f-t-bil-benzin': 0.16152,
      'f-hotel-uk': 10.4,
      'f-hotel-fr': 6.7,
      'f-hotel-de': 13.2,
      'f-hotel-nl': 14.8,
      'f-hotel-es': 7,
      'f-hotel-ch': 6.6,
      'f-hotel-us': 16.1,
      'f-hotel-it': 14.3,
      'f-c-diesel': 0.17265,
      'f-c-benzin': 0.16152,
      'f-c-el-beis': 0.02951,
      'f-c-hybrid': 0.12961,
      'f-c-bus': 0.12552,
      'f-c-tog': 0.03092,
    },
    rows: {
      'f-s1-diesel': 'Scope 1 > Fuels > Liquid fuels > Diesel (average biofuel blend) > per litres',
      'f-s1-benzin': 'Scope 1 > Fuels > Liquid fuels > Petrol (average biofuel blend) > per litres',
      'f-s1-naturgas': 'Scope 1 > Fuels > Gaseous fuels > Natural gas > per cubic metres',
      'f-s1-gasolie': 'Scope 1 > Fuels > Liquid fuels > Gas oil > per litres',
      'f-s1-hfc134a': 'Scope 1 > Refrigerant & other > Kyoto protocol products > HFC-134a > Emissions including only Kyoto products > per kg',
      'f-s2-fjernvarme-beis': 'Scope 2 > Heat and steam > Heat and steam > District heat and steam > kWh > per kWh',
      'f-k3-wtt-diesel': 'Scope 3 > WTT- fuels > Liquid fuels > Diesel (average biofuel blend) > per litres',
      'f-k3-wtt-benzin': 'Scope 3 > WTT- fuels > Liquid fuels > Petrol (average biofuel blend) > per litres',
      'f-k3-wtt-naturgas': 'Scope 3 > WTT- fuels > Gaseous fuels > Natural gas > per cubic metres',
      'f-k3-wtt-gasolie': 'Scope 3 > WTT- fuels > Liquid fuels > Gas oil > per litres',
      'f-k3-fjernvarme-td': 'Scope 3 > Transmission and distribution > Distribution - district heat & steam > 5% loss > kWh > per kWh',
      'f-w-papir-dep': 'Scope 3 > Waste disposal > Paper > Paper and board: mixed > Landfill > per tonnes',
      'f-w-papir-gen': 'Scope 3 > Waste disposal > Paper > Paper and board: mixed > Closed-loop > per tonnes',
      'f-w-trae-dep': 'Scope 3 > Waste disposal > Construction > Wood > Landfill > per tonnes',
      'f-w-trae-gen': 'Scope 3 > Waste disposal > Construction > Wood > Closed-loop > per tonnes',
      'f-w-plast-forbr': 'Scope 3 > Waste disposal > Plastic > Plastics: average plastics > Combustion > per tonnes',
      'f-w-plast-gen': 'Scope 3 > Waste disposal > Plastic > Plastics: average plastics > Closed-loop > per tonnes',
      'f-w-hush-forbr': 'Scope 3 > Waste disposal > Refuse > Household residual waste > Combustion > per tonnes',
      'f-w-blandet-forbr': 'Scope 3 > Waste disposal > Refuse > Commercial and industrial waste > Combustion > per tonnes',
      'f-w-blandet-gen': 'Scope 3 > Waste disposal > Metal > Metal: mixed cans > Closed-loop > per tonnes',
      'f-w-andet-dep': 'Scope 3 > Waste disposal > Electrical items > WEEE - mixed > Landfill > per tonnes',
      'f-w-andet-gen': 'Scope 3 > Waste disposal > Electrical items > WEEE - mixed > Open-loop > per tonnes',
      'f-t-fly-kort': 'Scope 3 > Business travel- air > Flights > Short-haul, to/from UK > Average passenger > With RF > per passenger.km',
      'f-t-fly-lang': 'Scope 3 > Business travel- air > Flights > Long-haul, to/from UK > Average passenger > With RF > per passenger.km',
      'f-t-fly-indenrigs': 'Scope 3 > Business travel- air > Flights > Domestic, to/from UK > Average passenger > With RF > per passenger.km',
      'f-t-bus': 'Scope 3 > Business travel- land > Bus > Local bus (not London) > per passenger.km',
      'f-t-tog': 'Scope 3 > Business travel- land > Rail > National rail > per passenger.km',
      'f-t-taxi': 'Scope 3 > Business travel- land > Taxis > Regular taxi > per passenger.km',
      'f-t-faerge': 'Scope 3 > Business travel- sea > Ferry > Average (all passenger) > per passenger.km',
      'f-t-bil-diesel': 'Scope 3 > Business travel- land > Cars (by size) > Average car > Diesel > per km',
      'f-t-bil-benzin': 'Scope 3 > Business travel- land > Cars (by size) > Average car > Petrol > per km',
      'f-hotel-uk': 'Scope 3 > Hotel stay > Hotel stay > UK > per Room per night',
      'f-hotel-fr': 'Scope 3 > Hotel stay > Hotel stay > France > per Room per night',
      'f-hotel-de': 'Scope 3 > Hotel stay > Hotel stay > Germany > per Room per night',
      'f-hotel-nl': 'Scope 3 > Hotel stay > Hotel stay > Netherlands > per Room per night',
      'f-hotel-es': 'Scope 3 > Hotel stay > Hotel stay > Spain > per Room per night',
      'f-hotel-ch': 'Scope 3 > Hotel stay > Hotel stay > Switzerland > per Room per night',
      'f-hotel-us': 'Scope 3 > Hotel stay > Hotel stay > United States > per Room per night',
      'f-hotel-it': 'Scope 3 > Hotel stay > Hotel stay > Italy > per Room per night',
      'f-c-diesel': 'Scope 3 > Business travel- land > Cars (by size) > Average car > Diesel > per km',
      'f-c-benzin': 'Scope 3 > Business travel- land > Cars (by size) > Average car > Petrol > per km',
      'f-c-el-beis': 'Scope 3 > Business travel- land > Cars (by size) > Average car > Battery Electric Vehicle > per km',
      'f-c-hybrid': 'Scope 3 > Business travel- land > Cars (by size) > Average car > Hybrid > per km',
      'f-c-bus': 'Scope 3 > Business travel- land > Bus > Local bus (not London) > per passenger.km',
      'f-c-tog': 'Scope 3 > Business travel- land > Rail > National rail > per passenger.km',
    },
  },
]
