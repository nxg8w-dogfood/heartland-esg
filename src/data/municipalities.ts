// Denmark's 98 municipalities and the electricity price area each lies in.
// Codes and regions: Statistics Denmark (Danmarks Statistik), table FOLK1A, variable OMRÅDE,
// read 2026-11-10 (Christiansø, which isn't a municipality, left out).
// Price area: DK2 (East Denmark) is Zealand, Lolland-Falster, Møn and Bornholm, which is exactly
// Region Hovedstaden and Region Sjælland. Everything west of the Great Belt, i.e. Jutland, Funen
// and their islands (Regions Nordjylland, Midtjylland and Syddanmark), is DK1 (West Denmark).

export type PriceArea = 'DK1' | 'DK2'

export type Municipality = {
  /** Statistics Denmark's municipality code, e.g. '751' for Aarhus */
  code: string
  name: string
  region: string
  priceArea: PriceArea
}

export const municipalities: readonly Municipality[] = [
  { code: '101', name: 'København', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '147', name: 'Frederiksberg', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '155', name: 'Dragør', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '185', name: 'Tårnby', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '165', name: 'Albertslund', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '151', name: 'Ballerup', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '153', name: 'Brøndby', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '157', name: 'Gentofte', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '159', name: 'Gladsaxe', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '161', name: 'Glostrup', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '163', name: 'Herlev', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '167', name: 'Hvidovre', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '169', name: 'Høje-Taastrup', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '183', name: 'Ishøj', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '173', name: 'Lyngby-Taarbæk', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '175', name: 'Rødovre', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '187', name: 'Vallensbæk', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '201', name: 'Allerød', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '240', name: 'Egedal', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '210', name: 'Fredensborg', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '250', name: 'Frederikssund', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '190', name: 'Furesø', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '270', name: 'Gribskov', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '260', name: 'Halsnæs', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '217', name: 'Helsingør', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '219', name: 'Hillerød', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '223', name: 'Hørsholm', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '230', name: 'Rudersdal', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '400', name: 'Bornholm', region: 'Region Hovedstaden', priceArea: 'DK2' },
  { code: '253', name: 'Greve', region: 'Region Sjælland', priceArea: 'DK2' },
  { code: '259', name: 'Køge', region: 'Region Sjælland', priceArea: 'DK2' },
  { code: '350', name: 'Lejre', region: 'Region Sjælland', priceArea: 'DK2' },
  { code: '265', name: 'Roskilde', region: 'Region Sjælland', priceArea: 'DK2' },
  { code: '269', name: 'Solrød', region: 'Region Sjælland', priceArea: 'DK2' },
  { code: '320', name: 'Faxe', region: 'Region Sjælland', priceArea: 'DK2' },
  { code: '376', name: 'Guldborgsund', region: 'Region Sjælland', priceArea: 'DK2' },
  { code: '316', name: 'Holbæk', region: 'Region Sjælland', priceArea: 'DK2' },
  { code: '326', name: 'Kalundborg', region: 'Region Sjælland', priceArea: 'DK2' },
  { code: '360', name: 'Lolland', region: 'Region Sjælland', priceArea: 'DK2' },
  { code: '370', name: 'Næstved', region: 'Region Sjælland', priceArea: 'DK2' },
  { code: '306', name: 'Odsherred', region: 'Region Sjælland', priceArea: 'DK2' },
  { code: '329', name: 'Ringsted', region: 'Region Sjælland', priceArea: 'DK2' },
  { code: '330', name: 'Slagelse', region: 'Region Sjælland', priceArea: 'DK2' },
  { code: '340', name: 'Sorø', region: 'Region Sjælland', priceArea: 'DK2' },
  { code: '336', name: 'Stevns', region: 'Region Sjælland', priceArea: 'DK2' },
  { code: '390', name: 'Vordingborg', region: 'Region Sjælland', priceArea: 'DK2' },
  { code: '420', name: 'Assens', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '430', name: 'Faaborg-Midtfyn', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '440', name: 'Kerteminde', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '482', name: 'Langeland', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '410', name: 'Middelfart', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '480', name: 'Nordfyns', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '450', name: 'Nyborg', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '461', name: 'Odense', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '479', name: 'Svendborg', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '492', name: 'Ærø', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '530', name: 'Billund', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '561', name: 'Esbjerg', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '563', name: 'Fanø', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '607', name: 'Fredericia', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '510', name: 'Haderslev', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '621', name: 'Kolding', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '540', name: 'Sønderborg', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '550', name: 'Tønder', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '573', name: 'Varde', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '575', name: 'Vejen', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '630', name: 'Vejle', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '580', name: 'Aabenraa', region: 'Region Syddanmark', priceArea: 'DK1' },
  { code: '710', name: 'Favrskov', region: 'Region Midtjylland', priceArea: 'DK1' },
  { code: '766', name: 'Hedensted', region: 'Region Midtjylland', priceArea: 'DK1' },
  { code: '615', name: 'Horsens', region: 'Region Midtjylland', priceArea: 'DK1' },
  { code: '707', name: 'Norddjurs', region: 'Region Midtjylland', priceArea: 'DK1' },
  { code: '727', name: 'Odder', region: 'Region Midtjylland', priceArea: 'DK1' },
  { code: '730', name: 'Randers', region: 'Region Midtjylland', priceArea: 'DK1' },
  { code: '741', name: 'Samsø', region: 'Region Midtjylland', priceArea: 'DK1' },
  { code: '740', name: 'Silkeborg', region: 'Region Midtjylland', priceArea: 'DK1' },
  { code: '746', name: 'Skanderborg', region: 'Region Midtjylland', priceArea: 'DK1' },
  { code: '706', name: 'Syddjurs', region: 'Region Midtjylland', priceArea: 'DK1' },
  { code: '751', name: 'Aarhus', region: 'Region Midtjylland', priceArea: 'DK1' },
  { code: '657', name: 'Herning', region: 'Region Midtjylland', priceArea: 'DK1' },
  { code: '661', name: 'Holstebro', region: 'Region Midtjylland', priceArea: 'DK1' },
  { code: '756', name: 'Ikast-Brande', region: 'Region Midtjylland', priceArea: 'DK1' },
  { code: '665', name: 'Lemvig', region: 'Region Midtjylland', priceArea: 'DK1' },
  { code: '760', name: 'Ringkøbing-Skjern', region: 'Region Midtjylland', priceArea: 'DK1' },
  { code: '779', name: 'Skive', region: 'Region Midtjylland', priceArea: 'DK1' },
  { code: '671', name: 'Struer', region: 'Region Midtjylland', priceArea: 'DK1' },
  { code: '791', name: 'Viborg', region: 'Region Midtjylland', priceArea: 'DK1' },
  { code: '810', name: 'Brønderslev', region: 'Region Nordjylland', priceArea: 'DK1' },
  { code: '813', name: 'Frederikshavn', region: 'Region Nordjylland', priceArea: 'DK1' },
  { code: '860', name: 'Hjørring', region: 'Region Nordjylland', priceArea: 'DK1' },
  { code: '849', name: 'Jammerbugt', region: 'Region Nordjylland', priceArea: 'DK1' },
  { code: '825', name: 'Læsø', region: 'Region Nordjylland', priceArea: 'DK1' },
  { code: '846', name: 'Mariagerfjord', region: 'Region Nordjylland', priceArea: 'DK1' },
  { code: '773', name: 'Morsø', region: 'Region Nordjylland', priceArea: 'DK1' },
  { code: '840', name: 'Rebild', region: 'Region Nordjylland', priceArea: 'DK1' },
  { code: '787', name: 'Thisted', region: 'Region Nordjylland', priceArea: 'DK1' },
  { code: '820', name: 'Vesthimmerlands', region: 'Region Nordjylland', priceArea: 'DK1' },
  { code: '851', name: 'Aalborg', region: 'Region Nordjylland', priceArea: 'DK1' },
]

export const priceAreaLabel: Record<PriceArea, string> = {
  DK1: 'DK1 – Vestdanmark (Jylland og Fyn)',
  DK2: 'DK2 – Østdanmark (Sjælland, øerne og Bornholm)',
}

export function municipality(code: string | null | undefined): Municipality | null {
  return (code && municipalities.find((m) => m.code === code)) || null
}
