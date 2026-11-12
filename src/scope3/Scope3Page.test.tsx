import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import { pageFromHash } from '../pages'
import { emptyAccount } from '../storage/account'
import { Scope3Page } from './Scope3Page'
import { scope3Href, scope3SubpageFromHash, scope3Subpages, type Scope3SubpageId } from './subpages'

const noop = () => {}

/** Scope 3 as the app shows it for the address in the browser. */
function render(hash: string, edit: (a: ReturnType<typeof emptyAccount>) => void = noop) {
  expect(pageFromHash(hash)).toBe('scope3')
  const a = emptyAccount()
  edit(a)
  return renderToStaticMarkup(
    <Scope3Page
      subpage={scope3SubpageFromHash(hash)}
      period={a.periods[0]}
      factors={factors}
      scope1Lines={a.scope1Lines}
      locations={a.locations}
      scope2Lines={a.scope2Lines}
      relevance={a.relevance}
      setRelevance={noop}
      params={a.category3Params}
      setParams={noop}
      cat4Lines={a.cat4Lines}
      setCat4Lines={noop}
      cat4SpendLines={a.cat4SpendLines}
      setCat4SpendLines={noop}
      cat5Lines={a.cat5Lines}
      setCat5Lines={noop}
      cat6Lines={a.cat6Lines}
      setCat6Lines={noop}
      surveys={a.surveys}
      setSurveys={noop}
      investments={a.investments}
      setInvestments={noop}
      cat1Lines={a.cat1Lines}
      setCat1Lines={noop}
      deflation={a.deflation}
      setDeflation={noop}
      ledger={a.ledger}
      setLedger={noop}
    />,
  )
}

const headings = (html: string) => [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1])
const current = (html: string) => html.match(/<a href="([^"]*)" aria-current="page">([^<]*)<\/a>/)?.slice(1)

describe('Scope 3 addresses', () => {
  it('keeps Scope 3 as the page for every sub-page', () => {
    expect(pageFromHash('#/scope3')).toBe('scope3')
    expect(pageFromHash('#/scope3/kategori-7')).toBe('scope3')
    expect(pageFromHash('#/scope3/indstillinger')).toBe('scope3')
    expect(pageFromHash('#/scope2')).toBe('scope2')
    expect(pageFromHash('')).toBe('scope1')
  })

  it('reads the sub-page, and falls back to the overview', () => {
    expect(scope3SubpageFromHash('#/scope3')).toBe('oversigt')
    expect(scope3SubpageFromHash('#/scope3/')).toBe('oversigt')
    expect(scope3SubpageFromHash('#/scope3/kategori-15')).toBe('kategori-15')
    expect(scope3SubpageFromHash('#/scope3/indstillinger')).toBe('indstillinger')
    expect(scope3SubpageFromHash('#/scope3/kategori-8')).toBe('oversigt')
  })

  it('round-trips every sub-page through its link', () => {
    for (const p of scope3Subpages) expect(scope3SubpageFromHash(scope3Href(p.id))).toBe(p.id)
  })

  it('starts with the overview, has a page for each calculated category, and ends with the settings', () => {
    expect(scope3Subpages.map((p) => p.id)).toEqual<Scope3SubpageId[]>([
      'oversigt', 'kategori-1', 'kategori-2', 'kategori-3', 'kategori-4', 'kategori-5', 'kategori-6', 'kategori-7', 'kategori-15', 'indstillinger',
    ])
  })
})

describe('Scope3Page', () => {
  it('shows the totals and every category on the overview', () => {
    const html = render('#/scope3')
    expect(current(html)).toEqual(['#/scope3', 'Oversigt'])
    expect(html).toContain('Scope 3, beregnet indtil videre')
    expect(headings(html)).toContain('Kategorier')
    // Links to the categories that have a page, and none to those that don't
    expect(html).toContain('<a href="#/scope3/kategori-7">7. Medarbejderpendling</a>')
    expect(html).not.toContain('#/scope3/kategori-8"')
    // Relevance is only read here; it is edited under the settings
    expect(html).not.toContain('type="checkbox"')
  })

  it('lists the same sub-pages on every page, so any page can be reached from any other', () => {
    for (const p of scope3Subpages) {
      const html = render(scope3Href(p.id))
      for (const q of scope3Subpages) expect(html).toContain(`href="${scope3Href(q.id)}"`)
    }
  })

  it('shows only the chosen category on its page', () => {
    const html = render('#/scope3/kategori-7')
    expect(current(html)).toEqual(['#/scope3/kategori-7', '7 — Pendling'])
    expect(headings(html)).toEqual(['Kategori 7 — medarbejderpendling'])
    expect(html).not.toContain('Scope 3, beregnet indtil videre')
  })

  it.each([
    ['kategori-1', 'Kategori 1 — indkøbte varer og services'],
    ['kategori-2', 'Kategori 2 — kapitalgoder'],
    ['kategori-3', 'Kategori 3 — brændstof- og energirelaterede aktiviteter'],
    ['kategori-4', 'Kategori 4 — upstream transport og distribution'],
    ['kategori-5', 'Kategori 5 — affald genereret i driften'],
    ['kategori-6', 'Kategori 6 — forretningsrejser'],
    ['kategori-15', 'Kategori 15 — investeringer'],
  ])('shows %s on its own page', (id, heading) => {
    const html = render(`#/scope3/${id}`)
    expect(current(html)?.[0]).toBe(`#/scope3/${id}`)
    expect(headings(html)[0]).toBe(heading)
  })

  it('says on a category page when the category is marked not relevant', () => {
    const html = render('#/scope3/kategori-4', (a) => { a.relevance[4] = { ...a.relevance[4], relevant: false } })
    expect(html).toContain('Kategori 4 er markeret ikke relevant under')
    expect(render('#/scope3/kategori-4', (a) => { a.relevance[4] = { ...a.relevance[4], relevant: true } })).not.toContain('er markeret ikke relevant')
  })

  it('collects relevance, the category 3 parameters and the index regulation under the settings', () => {
    const html = render('#/scope3/indstillinger')
    expect(current(html)).toEqual(['#/scope3/indstillinger', 'Indstillinger'])
    expect(headings(html)).toEqual(['Kategorier og relevans', 'Kategori 3 — parametre for el', 'Indeksregulering af spendfaktorer'])
    expect(html.match(/type="checkbox"/g)?.length).toBe(15 + 1) // one per category, and index regulation on/off
    expect(html).toContain('Begrundelse for kategori 15')
    expect(html).toContain('Nettab i elnettet')
    expect(html).toContain('WTT-ratio for el')
  })

  it('no longer edits settings on the category pages', () => {
    expect(render('#/scope3/kategori-3')).not.toContain('Nettab i elnettet <span')
    expect(render('#/scope3/kategori-1')).not.toContain('Indeksregulering af spendfaktorer')
  })

  it('shows each ledger posting on its category page with its status and the rule that hit it', () => {
    const posting = (id: string, account: string, text: string, amount = 1000) => ({ id, importId: 'i', date: '2025-05-01', account, accountName: '', supplier: '', text, amount, currency: 'DKK' })
    const withPostings = (a: ReturnType<typeof emptyAccount>) => {
      a.ledger = { ...a.ledger, postings: [
        posting('a', '240003', 'DSB Billet'),
        posting('b', '240003', 'Storebælt bro'),
        posting('c', '240003', 'GBTFEE'),
        posting('d', '630003', 'Volvo XC60'),
        posting('e', '210011', 'Revision 2025'),
      ] }
    }
    const cat6 = render('#/scope3/kategori-6', withPostings)
    expect(headings(cat6)).toContain('Posteringer fra kontoplanen')
    expect(cat6).toContain('R10 «DSB »')
    expect(cat6).toContain('R02 «Storebælt»')
    expect(cat6).toContain('Udeladt')
    // R23 moves the travel agency fee to category 1
    expect(cat6).not.toContain('R23 «GBTFEE»')
    const cat1 = render('#/scope3/kategori-1', withPostings)
    expect(cat1).toContain('R23 «GBTFEE»')
    expect(cat1).toContain('Kontoregel 210011')
    const cat2 = render('#/scope3/kategori-2', withPostings)
    expect(cat2).toContain('R27 «Volvo»')
    expect(cat2).toContain('Afventer')
  })
})
