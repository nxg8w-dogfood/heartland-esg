import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import type { Posting } from '../calc/ledger'
import { LedgerPage } from './LedgerPage'
import { emptyLedger } from './state'

const posting = (id: string, text: string): Posting => ({
  id, importId: 'i1', date: '2025-02-05', account: '6200', accountName: 'Software', supplier: 'Microsoft Ireland', text, amount: 100, currency: 'DKK',
})

const render = (postings: Posting[]) =>
  renderToStaticMarkup(<LedgerPage ledger={{ ...emptyLedger, postings }} setLedger={() => {}} factors={factors} />)

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
