// Reads the ESG owner's two rule files (kontoregler.csv and posteringsregler.csv) into account
// and posting rules. Used by scripts/scope3-rules-seed.ts to write src/data/scope3Rules.ts; the
// app itself only reads the generated file.

import { parseScope3Category, type AccountRule, type PostingHandling, type PostingRule, type RuleBasis } from './spendRules.ts'

/**
 * Splits one line on a delimiter. A field that starts with a quote runs to the next lone quote,
 * and "" inside it is a quote; text after the closing quote is kept.
 */
export function splitLine(line: string, delimiter: string): string[] {
  const fields: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === delimiter) { fields.push(field); field = '' }
    else field += c
  }
  fields.push(field)
  return fields
}

const lines = (text: string) => text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '')

/**
 * kontoregler.csv is a comma-separated file that went through a semicolon-separated export:
 * most rows end in ";", rows with a comma are wrapped in quotes as one field, and a ";" inside a
 * reason split the row in two. So each line is first read as semicolon-separated, the trailing
 * empty field dropped and the pieces joined again with "; ", and then read as comma-separated.
 */
export function parseAccountRules(text: string): AccountRule[] {
  const [header, ...rows] = lines(text)
  const columns = commaFields(header)
  const expected = ['Konto', 'Kontonavn', 'Medtages', 'Kategori', 'FaktorID', 'Grundlag', 'Begrundelse']
  if (expected.some((c, i) => columns[i] !== c)) throw new Error(`Unexpected columns in kontoregler: ${columns.join(', ')}`)
  return rows.map((line, i) => {
    const f = commaFields(line)
    const [account, name, include, category, factorCode, basis] = f.map((x) => x.trim())
    if (!/^\d+$/.test(account)) throw new Error(`Row ${i + 2}: no account number in "${line}"`)
    if (include !== 'Ja' && include !== 'Nej') throw new Error(`Row ${i + 2}: Medtages is "${include}"`)
    if (!['Datamanual', 'Skøn – bekræft', 'Afklar', ''].includes(basis)) throw new Error(`Row ${i + 2}: Grundlag is "${basis}"`)
    if (category && parseScope3Category(category) === null) throw new Error(`Row ${i + 2}: Kategori is "${category}"`)
    return {
      account,
      name,
      include: include === 'Ja',
      category: parseScope3Category(category),
      factorCode: factorCode || null,
      basis: basis as RuleBasis,
      // A reason with an unquoted comma comes out as several fields
      reason: f.slice(6).join(',').trim(),
    }
  })
}

function commaFields(line: string): string[] {
  const pieces = splitLine(line, ';')
  if (pieces.length > 1 && pieces[pieces.length - 1].trim() === '') pieces.pop()
  return splitLine(pieces.map((p, i) => (i === 0 ? p : p.trimStart())).join('; '), ',')
}

const handlings: Record<string, PostingHandling> = {
  Udelad: 'exclude',
  Medtag: 'include',
  'Medtag – review': 'review',
  Afventer: 'pending',
}

/**
 * posteringsregler.csv: a plain quoted CSV. Search words are kept exactly as written. The
 * approval stamp ("<initials> 27-10-2026") is reduced to its date: initials identify a person,
 * and this project keeps no personal data.
 */
export function parsePostingRules(text: string): PostingRule[] {
  const [header, ...rows] = lines(text)
  const columns = splitLine(header, ',')
  const expected = ['Prioritet', 'RegelID', 'Soegeord', 'GaelderForKategori', 'Handling', 'FaktorID', 'FlytTilKategori', 'Begrundelse', 'Godkendt']
  if (expected.some((c, i) => columns[i] !== c)) throw new Error(`Unexpected columns in posteringsregler: ${columns.join(', ')}`)
  return rows
    .map((line, i): PostingRule => {
      const [priority, id, searchWord, appliesTo, handling, factorCode, moveTo, reason, approved] = splitLine(line, ',')
      const h = handlings[handling?.trim()]
      if (!h) throw new Error(`Row ${i + 2}: Handling is "${handling}"`)
      const date = approved?.match(/(\d{2})-(\d{2})-(\d{4})\s*$/)
      return {
        id: id.trim(),
        priority: Number(priority),
        searchWord,
        appliesTo: appliesTo.trim() ? parseScope3Category(appliesTo) : null,
        handling: h,
        factorCode: factorCode.trim() || null,
        moveTo: moveTo.trim() ? parseScope3Category(moveTo) : null,
        reason: reason.trim(),
        approvedOn: date ? `${date[3]}-${date[2]}-${date[1]}` : '',
      }
    })
    .sort((a, b) => a.priority - b.priority)
}
