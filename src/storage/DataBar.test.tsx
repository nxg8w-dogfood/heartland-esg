import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DataBar, type SaveStatus } from './DataBar'

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
