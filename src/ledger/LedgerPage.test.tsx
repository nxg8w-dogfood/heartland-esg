import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import type { Posting } from '../calc/ledger'
import { LedgerPage } from './LedgerPage'
import { emptyLedger, type LedgerState } from './state'
import type { LedgerSubpageId } from './subpages'

const posting = (id: string, text: string): Posting => ({
  id, importId: 'i1', date: '2025-02-05', account: '6200', accountName: 'Software', supplier: 'Microsoft Ireland', text, amount: 100, currency: 'DKK',
})

const render = (postings: Posting[], subpage?: LedgerSubpageId, ledger: LedgerState = emptyLedger) =>
  renderToStaticMarkup(<LedgerPage ledger={{ ...ledger, postings }} setLedger={() => {}} factors={factors} subpage={subpage} />)

describe('LedgerPage sub-pages', () => {
  it('links Posteringer, Regler and Undtagelser, marking the one shown', () => {
    const html = render([], 'regler')
    expect(html).toContain('<nav aria-label="Kontoplan" class="subnav">')
    expect(html).toContain('<a href="#/kontoplan">Posteringer</a>')
    expect(html).toContain('<a href="#/kontoplan/regler" aria-current="page">Regler</a>')
    expect(html).toContain('<a href="#/kontoplan/undtagelser">Undtagelser</a>')
  })

  it('shows the import and postings on Posteringer only', () => {
    expect(render([])).toContain('Importer posteringer')
    expect(render([], 'regler')).not.toContain('Importer posteringer')
    expect(render([], 'regler')).toContain('Posteringsregler')
    expect(render([], 'undtagelser')).toContain('Ingen undtagelser endnu.')
    expect(render([], 'undtagelser')).not.toContain('Posteringsregler')
  })

  it('counts the exceptions in their tab', () => {
    const rule = { id: 'u', name: 'X', type: 'exclude' as const, active: true, conditions: [], factorId: null, category: 1, reason: '' }
    expect(render([], 'posteringer', { ...emptyLedger, rules: [rule] })).toContain('Undtagelser (1)</a>')
  })

  it('has only included and excluded tiles, plus untagged', () => {
    const html = render([posting('p1', 'x')])
    expect(html).toContain('<dt>Medtaget</dt>')
    expect(html).toContain('<dt>Udeladt</dt>')
    expect(html).not.toContain('Til review')
    expect(html).not.toContain('<dt>Afventer</dt>')
  })
})

describe('LedgerPage postings', () => {
  it('offers to create a rule from a posting text', () => {
    const html = render([posting('p1', 'Microsoft 365, år')])
    expect(html).toContain('Opret regel<span class="visually-hidden">: posteringstekst indeholder Microsoft 365, år</span>')
  })

  it('offers no rule for a posting without text', () => {
    expect(render([posting('p1', '  ')])).not.toContain('Opret regel')
  })

  it('tags manually through the factor search instead of a long list', () => {
    const html = render([posting('p1', 'x')])
    expect(html).toContain('<option value="search">Tag med faktor…</option>')
    expect(html).not.toContain('>Tag: ')
  })
})
