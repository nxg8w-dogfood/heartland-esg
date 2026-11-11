import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { movedHash, pageFromHash, pages } from '../pages'
import { Scope1Header } from './Scope1Header'
import { scope1Href, scope1SubpageFromHash, scope1Subpages, type Scope1SubpageId } from './subpages'

const current = (html: string) => html.match(/<a href="([^"]*)" aria-current="page">([^<]*)<\/a>/)?.slice(1)

describe('Scope 1 addresses', () => {
  it('keeps Scope 1 as the page for every sub-page', () => {
    expect(pageFromHash('#/scope1')).toBe('scope1')
    expect(pageFromHash('#/scope1/bilpark')).toBe('scope1')
    expect(pageFromHash('')).toBe('scope1')
  })

  it('reads the sub-page, and falls back to the emission lines', () => {
    expect(scope1SubpageFromHash('#/scope1')).toBe('udledninger')
    expect(scope1SubpageFromHash('#/scope1/')).toBe('udledninger')
    expect(scope1SubpageFromHash('#/scope1/bilpark')).toBe('bilpark')
    expect(scope1SubpageFromHash('#/scope1/ukendt')).toBe('udledninger')
    expect(scope1SubpageFromHash('')).toBe('udledninger')
  })

  it('round-trips every sub-page through its link', () => {
    for (const p of scope1Subpages) expect(scope1SubpageFromHash(scope1Href(p.id))).toBe(p.id)
  })

  it('has the emission lines first and Bilpark second', () => {
    expect(scope1Subpages.map((p) => p.id)).toEqual<Scope1SubpageId[]>(['udledninger', 'bilpark'])
  })
})

describe('Bilpark under Scope 1', () => {
  it('is no longer a page of its own in the header', () => {
    expect(pages.map((p) => p.id)).not.toContain('bilpark')
    expect(pages.map((p) => p.id)).toEqual(['koncern', 'scope1', 'scope2', 'scope3', 'kontoplan', 'faktorer'])
  })

  it('sends the old address, and anything below it, to its new one', () => {
    expect(movedHash('#/bilpark')).toBe('#/scope1/bilpark')
    expect(movedHash('#bilpark')).toBe('#/scope1/bilpark')
    expect(movedHash('#/bilpark/')).toBe('#/scope1/bilpark')
    expect(scope1SubpageFromHash(movedHash('#/bilpark')!)).toBe('bilpark')
  })

  it('leaves addresses that have not moved alone', () => {
    for (const hash of ['', '#/', '#/scope1', '#/scope1/bilpark', '#/scope3/kategori-7', '#/constructor', '#/toString']) {
      expect(movedHash(hash)).toBeNull()
    }
  })
})

describe('Scope1Header', () => {
  it('lists every sub-page in a labelled navigation, and marks the current one', () => {
    for (const p of scope1Subpages) {
      const html = renderToStaticMarkup(<Scope1Header subpage={p.id} />)
      expect(html).toContain('<nav aria-label="Scope 1" class="subnav">')
      for (const q of scope1Subpages) expect(html).toContain(`href="${scope1Href(q.id)}"`)
      expect(current(html)).toEqual([scope1Href(p.id), p.label])
      expect(html.match(/aria-current/g)).toHaveLength(1)
    }
  })

  it('keeps one Scope 1 heading on every sub-page', () => {
    expect(renderToStaticMarkup(<Scope1Header subpage="bilpark" />)).toContain('<h1>Scope 1 — direkte udledninger</h1>')
  })
})
