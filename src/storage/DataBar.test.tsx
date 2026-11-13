import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DataBar, SaveIndicator } from './DataBar'
import type { SaveStatus } from './saveStatus'

const text = (status: SaveStatus) =>
  renderToStaticMarkup(<DataBar storeLabel="Dataverse" central status={status} message={null} />).replace(/<[^>]+>/g, '')

describe('DataBar', () => {
  it('says a short save is under way', () => {
    expect(text({ state: 'pending' })).toBe('Gemmer …')
    expect(text({ state: 'pending', done: 3, total: 12 })).toBe('Gemmer …')
  })

  it('shows a long save\'s progress and asks the user to keep the app open', () => {
    expect(text({ state: 'pending', done: 3170, total: 18804 })).toBe('Gemmer 3.170 af 18.804 ændringer … Luk ikke appen, før det er gemt.')
  })
})

describe('SaveIndicator', () => {
  const html = (status: SaveStatus) => renderToStaticMarkup(<SaveIndicator status={status} />)

  it('shows nothing until something is saved', () => {
    expect(html({ state: 'idle' })).toBe('')
  })

  it('is visible from anywhere on the page while saving', () => {
    const out = html({ state: 'pending', done: 3170, total: 18804 })
    expect(out).toContain('save-indicator pending')
    expect(out).toContain('Gemmer 3.170 af 18.804 ændringer')
    expect(out).toContain('aria-live="polite"')
  })

  it('keeps a failure on screen and marks it as an error', () => {
    const out = html({ state: 'failed', reason: 'Dataverse afviste ændringen.' })
    expect(out).toContain('save-indicator failed')
    expect(out).toContain('Kunne ikke gemme: Dataverse afviste ændringen.')
    expect(out).not.toContain('save-spinner')
  })

  it('confirms a finished save', () => {
    expect(html({ state: 'saved', at: new Date('2026-11-13T10:27:00Z') })).toContain('save-indicator saved')
  })
})
