import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import { postingRules } from '../data/scope3Rules'
import { classifyLedger, type PostingRuleEdit, type Rule } from '../calc/ledger'
import { emptyLedger, type LedgerState } from './state'
import { RulesSection } from './RulesSection'

const noop = () => {}
const spendFactors = factors.filter((f) => f.method === 'spend')

function render(ledger: LedgerState) {
  return renderToStaticMarkup(<RulesSection ledger={ledger} setLedger={noop} classified={classifyLedger(ledger)} spendFactors={spendFactors} />)
}

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

describe('the rules on Kontoplan', () => {
  it('fold exceptions into a table like the standard rules, each with an edit button', () => {
    const html = render({ ...emptyLedger, rules: [exception] })
    expect(html).toContain('<summary>Undtagelser (1)</summary>')
    expect(row(html, 'Kantine')).toContain('Leverandør indeholder «Kantinen»')
    expect(row(html, 'Kantine')).toContain('Rediger<span class="visually-hidden"> Kantine</span>')
  })

  it('give every posting rule an edit button', () => {
    const html = render(emptyLedger)
    expect(html).toContain(`<summary>Posteringsregler (${postingRules.length})</summary>`)
    expect(html.match(/>Rediger<span class="visually-hidden"> R\d+</g)).toHaveLength(postingRules.length)
  })

  it('show a changed posting rule with its new handling and factor, and what was approved', () => {
    const html = render({ ...emptyLedger, ruleEdits: [r33] })
    expect(html).toContain(`<summary>Posteringsregler (${postingRules.length}, 1 ændret)</summary>`)
    const r = row(html, 'R33')
    expect(r).toContain('<td>Medtag</td>')
    expect(r).toContain('Other business services')
    expect(r).toContain('Ændret 13.11.2026 · godkendt: Afventer')
    expect(row(html, 'R34')).toContain('Godkendt')
  })
})
