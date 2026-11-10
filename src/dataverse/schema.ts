// The Dataverse tables for the climate accounts (docs/adr/0005, 0006 and 0007), as data. The
// apply script (scripts/dataverse-apply.ts) creates whatever is missing in an environment, so
// this file is the source of truth for the schema and is reviewed like any other code.
//
// Names are Danish without æ/ø/å, prefixed with the publisher prefix `hlesg`. Record ids are
// the app's own UUIDs, used unchanged as primary keys, so no table has an extra id column.

import type { AccountData } from '../storage/account'

export const PUBLISHER = {
  uniqueName: 'heartland',
  friendlyName: 'Heartland',
  prefix: 'hlesg',
  /** Choice values are this × 10,000 + n, as Dataverse requires for a publisher's choices */
  optionValuePrefix: 74810,
} as const

export const SOLUTION = { uniqueName: 'HeartlandESG', friendlyName: 'Heartland ESG', version: '1.0.0.0' } as const

export type Choice = { value: number; label: string; appValue: string }

export type Column =
  | { kind: 'text'; name: string; label: string; maxLength: number; required?: boolean; description?: string }
  | { kind: 'memo'; name: string; label: string; maxLength: number; description?: string }
  | { kind: 'decimal'; name: string; label: string; precision: number; min: number; max: number; description?: string }
  | { kind: 'integer'; name: string; label: string; min: number; max: number; description?: string }
  | { kind: 'date'; name: string; label: string; required?: boolean; description?: string }
  | { kind: 'datetime'; name: string; label: string; description?: string }
  | { kind: 'boolean'; name: string; label: string; trueLabel: string; falseLabel: string; default: boolean; description?: string }
  | { kind: 'choice'; name: string; label: string; options: readonly Choice[]; required?: boolean; description?: string }
  | { kind: 'lookup'; name: string; label: string; target: string; required: boolean; onDelete: 'Cascade' | 'RemoveLink' | 'Restrict'; description?: string }

export type Table = {
  /** Logical name, lowercase, e.g. hlesg_linje */
  name: string
  label: string
  pluralLabel: string
  description: string
  /** The primary name column */
  primary: { name: string; label: string; maxLength: number; required: boolean }
  columns: readonly Column[]
}

const P = PUBLISHER.prefix
const n = (s: string) => `${P}_${s}`
const option = (i: number, label: string, appValue: string): Choice => ({ value: PUBLISHER.optionValuePrefix * 10_000 + i, label, appValue })

/**
 * Every company-owned table points to its company, as its one parental relationship: deleting,
 * assigning or sharing the company does the same to its records (ADR 0006's business units).
 */
const company: Column = { kind: 'lookup', name: n('virksomhedid'), label: 'Virksomhed', target: n('virksomhed'), required: true, onDelete: 'Cascade' }

// Quantities, amounts and factors share one decimal shape: up to 10 decimals (factors have 5,
// derived values more) and Dataverse's full decimal range.
const decimal = (name: string, label: string, description?: string): Column =>
  ({ kind: 'decimal', name: n(name), label, precision: 10, min: -100_000_000_000, max: 100_000_000_000, description })
const text = (name: string, label: string, maxLength = 100, description?: string): Column => ({ kind: 'text', name: n(name), label, maxLength, description })
const date = (name: string, label: string, required = false): Column => ({ kind: 'date', name: n(name), label, required })

export const lineLists = [
  option(1, 'Scope 1', 'scope1Lines'),
  option(2, 'Scope 2', 'scope2Lines'),
  option(3, 'Kategori 1, indkøb', 'cat1Lines'),
  option(4, 'Kategori 4, fragt', 'cat4Lines'),
  option(5, 'Kategori 4, kurér og pakker', 'cat4SpendLines'),
  option(6, 'Kategori 5, affald', 'cat5Lines'),
  option(7, 'Kategori 6, forretningsrejser', 'cat6Lines'),
] as const

export const tables: readonly Table[] = [
  {
    name: n('koncern'),
    label: 'Koncern',
    pluralLabel: 'Koncerner',
    description: 'Koncernen i miljøet. Præcis én række (ADR 0006).',
    primary: { name: n('navn'), label: 'Navn', maxLength: 200, required: true },
    columns: [],
  },
  {
    name: n('virksomhed'),
    label: 'Virksomhed',
    pluralLabel: 'Virksomheder',
    description: 'En virksomhed i koncernen med sit eget klimaregnskab (ADR 0006).',
    primary: { name: n('navn'), label: 'Navn', maxLength: 200, required: true },
    columns: [],
  },
  {
    name: n('ejerandel'),
    label: 'Ejerandel',
    pluralLabel: 'Ejerandele',
    description: 'Koncernens ejerandel i en virksomhed fra et år, indtil næste ændring (ejerandelsmetoden, ADR 0006).',
    primary: { name: n('navn'), label: 'Navn', maxLength: 200, required: false },
    columns: [
      company,
      { kind: 'integer', name: n('fraaar'), label: 'Fra år', min: 1900, max: 2100 },
      { kind: 'decimal', name: n('procent'), label: 'Ejerandel (%)', precision: 4, min: 0, max: 100 },
    ],
  },
  {
    name: n('klimaregnskab'),
    label: 'Klimaregnskab',
    pluralLabel: 'Klimaregnskaber',
    description: 'Indstillinger for en virksomheds klimaregnskab. Én række pr. virksomhed.',
    primary: { name: n('navn'), label: 'Navn', maxLength: 200, required: false },
    columns: [
      company,
      date('periodestart', 'Periode fra'),
      date('periodeslut', 'Periode til'),
      decimal('nettab', 'Nettab for el (kategori 3)'),
      decimal('wttratio', 'WTT/direkte-forhold for el (kategori 3)'),
      { kind: 'boolean', name: n('indeksreguler'), label: 'Indeksregulér spendbeløb', trueLabel: 'Ja', falseLabel: 'Nej', default: false },
      text('indeksserie', 'Indeksserie', 100),
    ],
  },
  {
    name: n('lokation'),
    label: 'Lokation',
    pluralLabel: 'Lokationer',
    description: 'En lokation med elforbrug og fjernvarme (Scope 2).',
    primary: { name: n('navn'), label: 'Navn', maxLength: 200, required: true },
    columns: [
      company,
      text('elnetfamilie', 'Elnet (faktorfamilie)', 100),
      {
        kind: 'choice', name: n('markedsinstrument'), label: 'Market-based instrument', required: true,
        options: [option(1, 'PPA', 'ppa'), option(2, 'Oprindelsesgaranti', 'oprindelsesgaranti'), option(3, 'Residualmiks', 'residualmiks')],
      },
      text('fjernvarmefaktor', 'Fjernvarmefaktor (faktor-id)', 100),
    ],
  },
  {
    name: n('linje'),
    label: 'Linje',
    pluralLabel: 'Linjer',
    description: 'En linje med mængde eller beløb: Scope 1, Scope 2 og Scope 3-kategori 1, 4, 5 og 6 (ADR 0005).',
    primary: { name: n('beskrivelse'), label: 'Beskrivelse', maxLength: 400, required: false },
    columns: [
      company,
      { kind: 'choice', name: n('liste'), label: 'Liste', options: lineLists, required: true, description: 'Hvilken del af regnskabet linjen hører til.' },
      text('gruppe', 'Type', 100, 'Linjetypen i appen, fx s1-diesel eller k6-hotel.'),
      date('dato', 'Dato', true),
      date('tildato', 'Til dato'),
      decimal('maengde', 'Mængde', 'I linjetypens enhed. Scope 2: kWh.'),
      decimal('beloeb', 'Beløb', 'Spendlinjer.'),
      text('valuta', 'Valuta', 3),
      text('faktorid', 'Faktor', 100, 'Faktorens id, når linjen bruger en anden end typens.'),
      decimal('egenfaktor', 'Egen faktor', 'kg CO2e pr. enhed; erstatter tabellens faktor.'),
      { kind: 'lookup', name: n('lokationid'), label: 'Lokation', target: n('lokation'), required: false, onDelete: 'Restrict', description: 'Scope 2-linjer.' },
      {
        kind: 'choice', name: n('energiart'), label: 'Energi', description: 'Scope 2-linjer.',
        options: [option(1, 'El', 'electricity'), option(2, 'Fjernvarme', 'heating')],
      },
    ],
  },
  {
    name: n('pendling'),
    label: 'Pendlerundersøgelse',
    pluralLabel: 'Pendlerundersøgelser',
    description: 'En pendlerundersøgelse (kategori 7). Svarene pr. transportform ligger som JSON.',
    primary: { name: n('navn'), label: 'Navn', maxLength: 200, required: false },
    columns: [
      company,
      date('dato', 'Dato', true),
      { kind: 'integer', name: n('medarbejdere'), label: 'Medarbejdere', min: 0, max: 1_000_000 },
      { kind: 'integer', name: n('besvarelser'), label: 'Besvarelser', min: 0, max: 1_000_000 },
      decimal('arbejdsuger', 'Arbejdsuger pr. år'),
      { kind: 'memo', name: n('svar'), label: 'Svar pr. transportform (JSON)', maxLength: 20_000 },
    ],
  },
  {
    name: n('investering'),
    label: 'Investering',
    pluralLabel: 'Investeringer',
    description: 'En investering med ejerandel på højst 50 % (kategori 15).',
    primary: { name: n('selskab'), label: 'Selskab', maxLength: 200, required: false },
    columns: [
      company,
      date('dato', 'Dato', true),
      decimal('ejerandel', 'Ejerandel (%)'),
      {
        kind: 'choice', name: n('regnskabsmetode'), label: 'Regnskabsmæssig behandling',
        options: [option(1, 'Associeret', 'Ass.'), option(2, 'Andre investeringer', 'Other investments')],
      },
      text('klimametode', 'Klimametode', 200),
      text('datakilde', 'Datakilde', 200),
      {
        kind: 'choice', name: n('grundlag'), label: 'Grundlag',
        options: [option(1, 'CO2e', 'CO2e'), option(2, 'Omsætning', 'Revenue'), option(3, 'Investering', 'Investment')],
      },
      decimal('udledningkg', 'Selskabets udledning (kg CO2e)'),
      decimal('omsaetningdkk', 'Omsætning (DKK)'),
      decimal('omsaetninglokal', 'Omsætning (lokal valuta)'),
      text('lokalvaluta', 'Lokal valuta', 3),
      decimal('kurs', 'Kurs (DKK pr. enhed)'),
      decimal('faktorpreur', 'Faktor (kg CO2e pr. EUR)'),
      text('faktorkilde', 'Faktorkilde', 200),
      text('land', 'Land', 100),
    ],
  },
  {
    name: n('faktorkilde'),
    label: 'Faktorkilde',
    pluralLabel: 'Faktorkilder',
    description: 'Den valgte kilde for en faktor i en virksomheds regnskab. Uden række bruges den indbyggede tabel.',
    primary: { name: n('faktorid'), label: 'Faktor', maxLength: 100, required: true },
    columns: [
      company,
      {
        kind: 'choice', name: n('kildetype'), label: 'Kilde', required: true,
        options: [option(1, 'Publikation', 'publication'), option(2, 'Anden kilde', 'manual'), option(3, 'API', 'api')],
      },
      text('publikation', 'Publikation', 100),
      decimal('vaerdi', 'Værdi'),
      text('kildetekst', 'Kildeangivelse', 400),
      text('kildedato', 'Kildens dato', 10),
      text('udbyder', 'API-udbyder', 100),
      text('forespoergsel', 'API-forespørgsel', 400),
      text('hentet', 'Hentet', 40),
    ],
  },
  {
    name: n('relevans'),
    label: 'Relevans',
    pluralLabel: 'Relevans',
    description: 'Om en Scope 3-kategori er relevant for virksomheden, og hvorfor.',
    primary: { name: n('navn'), label: 'Navn', maxLength: 200, required: false },
    columns: [
      company,
      { kind: 'integer', name: n('kategori'), label: 'Kategori', min: 1, max: 15 },
      { kind: 'boolean', name: n('relevant'), label: 'Relevant', trueLabel: 'Ja', falseLabel: 'Nej', default: false },
      { kind: 'memo', name: n('begrundelse'), label: 'Begrundelse', maxLength: 4_000 },
    ],
  },
  {
    name: n('indekspunkt'),
    label: 'Indeksværdi',
    pluralLabel: 'Indeksværdier',
    description: 'En prisindeksværdi for et år, til indeksregulering af spendlinjer.',
    primary: { name: n('navn'), label: 'Navn', maxLength: 200, required: false },
    columns: [
      company,
      text('serie', 'Indeksserie', 100),
      { kind: 'integer', name: n('aar'), label: 'År', min: 1900, max: 2100 },
      decimal('vaerdi', 'Værdi'),
    ],
  },
  {
    name: n('prisaar'),
    label: 'Faktorens prisår',
    pluralLabel: 'Faktorernes prisår',
    description: 'Basisåret for en spendfaktors priser, og evt. faktorens egen indeksserie.',
    primary: { name: n('faktorid'), label: 'Faktor', maxLength: 100, required: true },
    columns: [
      company,
      { kind: 'integer', name: n('basisaar'), label: 'Basisår', min: 1900, max: 2100 },
      text('serie', 'Indeksserie', 100),
    ],
  },
  {
    name: n('import'),
    label: 'Import',
    pluralLabel: 'Importer',
    description: 'En indlæst fil med posteringer fra kontoplanen.',
    primary: { name: n('filnavn'), label: 'Filnavn', maxLength: 260, required: false },
    columns: [
      company,
      { kind: 'datetime', name: n('importeret'), label: 'Importeret' },
      { kind: 'integer', name: n('antal'), label: 'Antal posteringer', min: 0, max: 10_000_000 },
    ],
  },
  {
    name: n('postering'),
    label: 'Postering',
    pluralLabel: 'Posteringer',
    description: 'En postering fra kontoplanen, med en evt. manuel handling som kolonner (ADR 0005).',
    primary: { name: n('tekst'), label: 'Tekst', maxLength: 400, required: false },
    // Belongs to its import, which belongs to the company: a table can have only one parental
    // relationship, and deleting the company still removes its postings through the import.
    columns: [
      { kind: 'lookup', name: n('importid'), label: 'Import', target: n('import'), required: true, onDelete: 'Cascade' },
      date('dato', 'Dato'),
      text('konto', 'Konto', 50),
      text('kontonavn', 'Kontonavn', 200),
      text('leverandoer', 'Leverandør', 200),
      decimal('beloeb', 'Beløb'),
      text('valuta', 'Valuta', 3),
      {
        kind: 'choice', name: n('manuelhandling'), label: 'Manuel handling',
        options: [option(1, 'Tagget', 'tag'), option(2, 'Ekskluderet', 'exclude')],
      },
      text('manuelfaktor', 'Manuel faktor', 100),
      { kind: 'integer', name: n('manuelkategori'), label: 'Manuel kategori', min: 1, max: 15 },
      text('manuelbegrundelse', 'Manuel begrundelse', 400),
    ],
  },
  {
    name: n('regel'),
    label: 'Regel',
    pluralLabel: 'Regler',
    description: 'En regel, der tagger eller ekskluderer posteringer. Den første regel, der passer, vinder.',
    primary: { name: n('navn'), label: 'Navn', maxLength: 200, required: true },
    columns: [
      company,
      { kind: 'integer', name: n('raekkefoelge'), label: 'Rækkefølge', min: 0, max: 1_000_000, description: 'Lavest først; den første regel, der passer, vinder.' },
      { kind: 'choice', name: n('regeltype'), label: 'Type', required: true, options: [option(1, 'Tag', 'tag'), option(2, 'Ekskludér', 'exclude')] },
      { kind: 'boolean', name: n('aktiv'), label: 'Aktiv', trueLabel: 'Ja', falseLabel: 'Nej', default: true },
      { kind: 'memo', name: n('betingelser'), label: 'Betingelser (JSON)', maxLength: 20_000 },
      text('faktorid', 'Faktor', 100),
      { kind: 'integer', name: n('kategori'), label: 'Kategori', min: 1, max: 15 },
      text('begrundelse', 'Begrundelse', 400),
    ],
  },
]

/**
 * Where each part of a company's account is stored. Typed against AccountData, so a new part
 * of the account doesn't type-check until it's given a table here.
 */
export const accountStorage: Record<keyof AccountData, { table: string; note?: string } | null> = {
  version: null,
  period: { table: n('klimaregnskab') },
  scope1Lines: { table: n('linje') },
  locations: { table: n('lokation') },
  scope2Lines: { table: n('linje') },
  factorSources: { table: n('faktorkilde') },
  relevance: { table: n('relevans') },
  category3Params: { table: n('klimaregnskab') },
  cat1Lines: { table: n('linje') },
  cat4Lines: { table: n('linje') },
  cat4SpendLines: { table: n('linje') },
  cat5Lines: { table: n('linje') },
  cat6Lines: { table: n('linje') },
  surveys: { table: n('pendling') },
  investments: { table: n('investering') },
  deflation: { table: n('klimaregnskab'), note: 'active and series on the account; values in hlesg_indekspunkt, base years in hlesg_prisaar' },
  ledger: { table: n('postering'), note: 'with hlesg_import and hlesg_regel' },
}
