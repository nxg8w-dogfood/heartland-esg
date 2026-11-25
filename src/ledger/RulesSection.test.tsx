import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import { accountRules, postingRules } from '../data/scope3Rules'
import { classifyLedger, type PostingRuleEdit, type Rule } from '../calc/ledger'
import { emptyLedger, type LedgerState } from './state'
import { ExceptionsSection, RuleEditor, StandardRulesSection } from './RulesSection'

const noop = () => {}
const spendFactors = factors.filter((f) => f.method === 'spend')

const standard = (ledger: LedgerState) =>
  renderToStaticMarkup(<StandardRulesSection ledger={ledger} setLedger={noop} classified={classifyLedger(ledger)} spendFactors={spendFactors} />)
const exceptions = (ledger: LedgerState) =>
  renderToStaticMarkup(<ExceptionsSection ledger={ledger} setLedger={noop} classified={classifyLedger(ledger)} spendFactors={spendFactors} />)

/** The table row whose header cell starts with `label`. */
function row(html: string, label: string): string {
  const start = html.indexOf(`<th scope="row">${label}`)
  expect(start).toBeGreaterThan(-1)
  return html.slice(start, html.indexOf('</tr>', start))
}

const exception: Rule = {
  id: 'u1', name: 'Kantine', type: 'exclude', active: true, conditions: [{ id: 'c', field: 'supplier', operator: 'contains', value: 'Kantinen' }],
  factorId: null, category: 1, reason: 'Intern',
}
const r33: PostingRuleEdit = { id: 'e1', ruleId: 'R33', handling: 'include', factorId: 'f-exio-obs-dk', moveTo: null, reason: 'Arkitektrådgivning', editedOn: '2026-11-13' }

describe('Kontoplan → Undtagelser', () => {
  it('lists exceptions in a table, each with an edit button', () => {
    const html = exceptions({ ...emptyLedger, rules: [exception] })
    expect(html).toContain('<h2 id="exceptions-heading">Undtagelser</h2>')
    expect(row(html, 'Kantine')).toContain('Leverandør indeholder «Kantinen»')
    expect(row(html, 'Kantine')).toContain('Rediger<span class="visually-hidden"> Kantine</span>')
  })

  it('can be filtered by text, handling, category and status', () => {
    const html = exceptions({ ...emptyLedger, rules: [exception] })
    expect(html).toContain('role="search" aria-label="Filtrer undtagelser"')
    expect(html).toMatch(/<label for="[^"]+-handling">Handling<\/label>/)
    expect(html).toMatch(/<label for="[^"]+-category">Kategori<\/label>/)
    expect(html).toContain('<option value="inactive">Inaktive</option>')
    expect(html).toContain('1 undtagelse.')
  })

  it('has no filters before there is anything to filter', () => {
    const html = exceptions(emptyLedger)
    expect(html).toContain('Ingen undtagelser endnu.')
    expect(html).not.toContain('role="search"')
  })
})

describe('the exception editor', () => {
  const posting = { id: 'p1', importId: 'i', date: '2025-01-01', account: '6300', accountName: 'Kantine', supplier: 'Kantinen ApS', text: 'Frokost', amount: 1, currency: 'DKK' }
  const html = renderToStaticMarkup(<RuleEditor rule={exception} title="Ny undtagelse" postings={[posting]} spendFactors={spendFactors} onSave={noop} onCancel={noop} />)

  it('saves with Gem and leaves the rule as it was with Annullér', () => {
    expect(html).toContain('<button type="submit">Gem</button>')
    expect(html).toContain('>Annullér</button>')
  })

  it('says how many postings the rule as edited matches', () => {
    expect(html).toContain('1 postering passer')
  })
})

describe('Kontoplan → Regler', () => {
  it('give every posting rule an edit button, and filters', () => {
    const html = standard(emptyLedger)
    expect(html).toContain(`Posteringsregler (${postingRules.length})</h2>`)
    expect(html.match(/>Rediger<span class="visually-hidden"> R\d+</g)).toHaveLength(postingRules.length)
    expect(html).toContain('aria-label="Filtrer posteringsregler"')
    expect(html).toContain('<option value="changed">Ændret for virksomheden</option>')
    expect(html).toContain('aria-label="Filtrer kontoregler"')
    expect(html).toContain(`Kontoregler (${accountRules.length})</h2>`)
  })

  it('show a changed posting rule with its new handling and factor, and what was approved', () => {
    const html = standard({ ...emptyLedger, ruleEdits: [r33] })
    expect(html).toContain(`Posteringsregler (${postingRules.length}, 1 ændret)</h2>`)
    const r = row(html, 'R33')
    expect(r).toContain('<td>Medtag</td>')
    expect(r).toContain('Other business services')
    expect(r).toContain('Ændret 13.11.2026 · godkendt: Udelad')
    expect(row(html, 'R34')).toContain('Godkendt')
  })
})
