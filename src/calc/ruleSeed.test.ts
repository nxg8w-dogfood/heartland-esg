import { describe, expect, it } from 'vitest'
import { parseAccountRules, parsePostingRules, splitLine } from './ruleSeed'

// Rows as they appear in kontoregler.csv, including the irregular ones
const accounts = [
  '\uFEFFKonto,Kontonavn,Medtages,Kategori,FaktorID,Grundlag,Begrundelse;',
  '100001,Nettoomsætning,Nej,,,,;',
  '"100004,""Udlejning, erhverv"",Nej,,,,";',
  '101002,Direkte omkostninger,Nej,Scope 3.1,,Afklar,Direkte omkostninger – ingen entydig kategori; kontrollér posteringer',
  '"101103,""Vedligeholdelse, installationer"",Ja,Scope 3.1,EXIO-CONS,Skøn – bekræft,Installationer i bygninger"; manualen nævner bygningsvedligehold',
  '"101116,Renovation,Nej,,,Afklar,""Renovation/affald: hører under Scope 3.5 (aktivitetsbaseret, BEIS) – ingen udgiftsfaktor i datamanual""";',
  '"220001,Husleje,Ja,Scope 3.8,BEIS-RENT,Skøn – bekræft,""Brugervalgt BEIS UK 2022: 0,1499 kg CO₂e/GBP. Foreløbig kilde: evaluta.dk";" ikke direkte verificeret."""',
  '240003,Transport,Ja,Scope 3.6,EXIO-LAND,Datamanual,Bus/taxi/bil → Other land transportation services;',
].join('\r\n')

describe('splitLine', () => {
  it('reads quoted fields with doubled quotes, and keeps text after a closing quote', () => {
    expect(splitLine('"a,""b""",c', ',')).toEqual(['a,"b"', 'c'])
    expect(splitLine('"x" y;z', ';')).toEqual(['x y', 'z'])
    expect(splitLine('a;', ';')).toEqual(['a', ''])
  })
})

describe('parseAccountRules', () => {
  const rules = parseAccountRules(accounts)

  it('reads every row', () => {
    expect(rules.map((r) => r.account)).toEqual(['100001', '100004', '101002', '101103', '101116', '220001', '240003'])
  })

  it('reads plain rows with a trailing semicolon', () => {
    expect(rules[0]).toEqual({ account: '100001', name: 'Nettoomsætning', include: false, category: null, factorCode: null, basis: '', reason: '' })
    expect(rules[6]).toMatchObject({ include: true, category: 6, factorCode: 'EXIO-LAND', basis: 'Datamanual', reason: 'Bus/taxi/bil → Other land transportation services' })
  })

  it('reads a row wrapped in quotes as one field, with a comma in the name', () => {
    expect(rules[1]).toMatchObject({ account: '100004', name: 'Udlejning, erhverv', include: false })
  })

  it('puts a reason split by a semicolon back together', () => {
    expect(rules[2].reason).toBe('Direkte omkostninger – ingen entydig kategori; kontrollér posteringer')
    expect(rules[3]).toMatchObject({ name: 'Vedligeholdelse, installationer', basis: 'Skøn – bekræft', reason: 'Installationer i bygninger; manualen nævner bygningsvedligehold' })
    expect(rules[5]).toMatchObject({ category: 8, factorCode: 'BEIS-RENT', reason: 'Brugervalgt BEIS UK 2022: 0,1499 kg CO₂e/GBP. Foreløbig kilde: evaluta.dk; ikke direkte verificeret.' })
  })

  it('reads a quoted reason with commas inside a wrapped row', () => {
    expect(rules[4]).toMatchObject({ basis: 'Afklar', reason: 'Renovation/affald: hører under Scope 3.5 (aktivitetsbaseret, BEIS) – ingen udgiftsfaktor i datamanual' })
  })

  it('refuses unexpected columns or values rather than guessing', () => {
    expect(() => parseAccountRules('Konto,Navn\n1,a')).toThrow(/columns/)
    expect(() => parseAccountRules(accounts.split('\r\n')[0] + '\n1,a,Måske,,,,')).toThrow(/Medtages/)
    expect(() => parseAccountRules(accounts.split('\r\n')[0] + '\n1,a,Ja,Scope 3.1,,Gæt,')).toThrow(/Grundlag/)
  })
})

describe('parsePostingRules', () => {
  const text = [
    '\uFEFF"Prioritet","RegelID","Soegeord","GaelderForKategori","Handling","FaktorID","FlytTilKategori","Begrundelse","Godkendt"',
    '"10","R10","DSB ","Scope 3.6","Medtag","EXIO-RAIL","","Togrejse, med \'Skodsborg\'","AB 27-10-2026"',
    '"1","R01","Loyalty Bonus","","Udelad","","","Bonus","AB 27-10-2026"',
    '"23","R23","GBTFEE","Scope 3.6","Medtag","EXIO-OBS","Scope 3.1","Gebyr","AB 27-10-2026"',
    '"19","R19","Carbooking","Scope 3.6","Medtag – review","EXIO-LAND","","Billeje","AB 27-10-2026"',
    '"28","R25","Samlerobjekt","Scope 3.2","Afventer","EXIO-FURN","","Aktiv","AB 27-10-2026"',
  ].join('\n')
  const rules = parsePostingRules(text)

  it('sorts by priority and maps the handling', () => {
    expect(rules.map((r) => [r.id, r.handling])).toEqual([['R01', 'exclude'], ['R10', 'include'], ['R19', 'review'], ['R23', 'include'], ['R25', 'pending']])
  })

  it('keeps the search word exactly, trailing space included', () => {
    expect(rules[1].searchWord).toBe('DSB ')
  })

  it('reads categories, the move and the factor', () => {
    expect(rules[0]).toMatchObject({ appliesTo: null, factorCode: null, moveTo: null })
    expect(rules[3]).toMatchObject({ appliesTo: 6, factorCode: 'EXIO-OBS', moveTo: 1 })
  })

  it('keeps only the date of the approval stamp, not the initials', () => {
    expect(rules[0].approvedOn).toBe('2026-10-27')
    expect(JSON.stringify(rules)).not.toContain('AB ')
  })

  it('refuses an unknown handling', () => {
    expect(() => parsePostingRules(text.split('\n')[0] + '\n"1","R1","x","","Måske","","","",""')).toThrow(/Handling/)
  })
})
