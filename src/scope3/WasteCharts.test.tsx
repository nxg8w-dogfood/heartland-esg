import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import { WasteCharts } from './WasteCharts'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }

describe('WasteCharts', () => {
  it('shows all waste and a chart per fraction', () => {
    const html = renderToStaticMarkup(
      <WasteCharts
        factors={factors}
        period={year2025}
        lines={[
          { id: 'a', group: 'k5-papir-gen', date: '2025-05-01', dateTo: '2025-05-31', quantity: 1.5 },
          { id: 'b', group: 'k5-plast-gen', date: '2025-06-01', dateTo: '2025-06-30', quantity: 0.5 },
        ]}
      />,
    )
    expect(html).toContain('<strong>Alt affald</strong>')
    expect(html).toContain('<strong>Pap/papir</strong>')
    expect(html).toContain('<strong>Plast</strong>')
    expect(html).toContain('aria-label="maj 2025: 1,50 tons"')
  })

  it('shows nothing without waste in the period', () => {
    expect(renderToStaticMarkup(<WasteCharts factors={factors} period={year2025} lines={[]} />)).toBe('')
  })
})
