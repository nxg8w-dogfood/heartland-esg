import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { activitySummary, type ActivityGroup, type ActivityLine } from '../calc/activity'
import { factors } from '../data/factors'
import { category4Groups } from '../calc/scope3'
import { DocumentsContext, type Documents, type DocumentStores } from '../storage/documents'
import { ActivityLinesSection } from './ActivityLinesSection'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }
const noop = () => {}
const line: ActivityLine = { id: 'l1', group: category4Groups[0].id, date: '2025-03-01', quantity: 100 }

const render = (lines: ActivityLine[]) =>
  renderToStaticMarkup(
    <ActivityLinesSection
      title="Fragt"
      groups={category4Groups as readonly ActivityGroup[]}
      factors={factors}
      summary={activitySummary(lines, category4Groups, factors, year2025)}
      lines={lines}
      setLines={noop}
      defaultDate={year2025.start}
      emptyText="Ingen fragt i perioden."
    />,
  )

describe('The Tilføj linje form under activity lines', () => {
  it('sits under the lines, with a heading of its own that names the form', () => {
    const html = render([line])
    expect(html.indexOf('>Tilføj linje</h3>')).toBeGreaterThan(html.indexOf('</table>'))
    const heading = html.match(/<h3 id="([^"]*-heading)">Tilføj linje<\/h3>/)![1]
    expect(html).toContain(`aria-labelledby="${heading}"`)
  })

  it('is collapsed behind its toggle once there are lines', () => {
    const html = render([line])
    expect(html).toMatch(/<button type="button" class="link" aria-expanded="false" aria-controls="[^"]*-form">Vis formular/)
    expect(html).toMatch(/<form id="[^"]*-form" class="add-line" noValidate="" aria-labelledby="[^"]*" hidden="">/)
  })

  it('is open from the start when there are no lines yet', () => {
    const html = render([])
    expect(html).toMatch(/aria-controls="[^"]*-form">Skjul formular/)
    expect(html).not.toMatch(/<form id="[^"]*-form"[^>]*hidden/)
  })
})

describe('Activity lines folded behind a summary', () => {
  const lines: ActivityLine[] = [{ ...line, locationId: 'loc-1' }, { ...line, id: 'l2', quantity: 50 }]
  const html = renderToStaticMarkup(
    <ActivityLinesSection
      title="Affald"
      groups={category4Groups as readonly ActivityGroup[]}
      factors={factors}
      summary={activitySummary(lines, category4Groups, factors, year2025)}
      lines={lines}
      setLines={noop}
      defaultDate={year2025.start}
      emptyText="Intet affald."
      collapsible
      locations={[{ id: 'loc-1', name: 'Storetorv 1' }]}
    />,
  )

  it('is closed, with the line count and the total in its summary', () => {
    expect(html).toMatch(/<details class="lines-details"><summary>2 linjer i perioden · I alt/)
    expect(html.indexOf('<table')).toBeGreaterThan(html.indexOf('</summary>'))
  })

  it("shows each line's address, and a dash for one without", () => {
    expect(html).toContain('<th scope="col">Adresse</th>')
    expect(html).toContain('<td>Storetorv 1</td>')
    expect(html).toContain('<td>—</td>')
    expect(html).toContain('<th scope="row" colSpan="6">I alt</th>')
  })
})

describe('Grouping the lines', () => {
  const lines: ActivityLine[] = [
    { id: 'a', group: category4Groups[1].id, date: '2025-03-01', quantity: 10 },
    { id: 'b', group: category4Groups[0].id, date: '2025-04-01', quantity: 20 },
  ]
  const renderGroupable = (groupable: boolean) =>
    renderToStaticMarkup(
      <ActivityLinesSection
        title="Fragt"
        groups={category4Groups as readonly ActivityGroup[]}
        factors={factors}
        summary={activitySummary(lines, category4Groups, factors, year2025)}
        lines={lines}
        setLines={noop}
        defaultDate={year2025.start}
        emptyText="Ingen fragt i perioden."
        groupable={groupable}
      />,
    )

  it('groups by type with a subtotal per type, when the section allows it', () => {
    const html = renderGroupable(true)
    expect(html).toContain('>Gruppér linjerne</label>')
    expect(html.match(/<tbody class="line-group">/g)).toHaveLength(2)
    expect(html).toContain(`<th scope="rowgroup" colSpan="5">${category4Groups[0].label} <span class="muted">· 1 linje · 20,00 tonkm</span>`)
  })

  it('lists the lines as entered otherwise', () => {
    const html = renderGroupable(false)
    expect(html).not.toContain('Gruppér linjerne')
    expect(html).not.toContain('line-group')
  })
})

describe('Documents on a line (ADR 0035)', () => {
  const stores = { investment: {}, line: { list: async () => [] }, survey: {} } as unknown as DocumentStores
  const withDocuments = (documentExample?: string, documents: Documents | null = { stores, saved: true }) =>
    renderToStaticMarkup(
      <DocumentsContext.Provider value={documents}>
        <ActivityLinesSection
          title="Fragt"
          groups={category4Groups as readonly ActivityGroup[]}
          factors={factors}
          summary={activitySummary([line], category4Groups, factors, year2025)}
          lines={[line]}
          setLines={noop}
          defaultDate={year2025.start}
          emptyText="Ingen fragt i perioden."
          documentExample={documentExample}
        />
      </DocumentsContext.Provider>,
    )

  it('gives each Scope 3 line a Dokumenter button next to Slet, closed until clicked', () => {
    const html = withDocuments('fragtbrevet')
    expect(html).toMatch(/<div class="row-actions"><button type="button" class="link" aria-expanded="false" aria-controls="docs-line-l1">Dokumenter<span class="visually-hidden"> for [^<]+<\/span><\/button><button[^>]*>Slet<\/button>/)
    expect(html).not.toContain('id="docs-line-l1"')
  })

  it('offers none outside Power Apps, or where the lines take no documents (Scope 1)', () => {
    expect(withDocuments('fragtbrevet', null)).not.toContain('Dokumenter')
    expect(withDocuments(undefined)).not.toContain('Dokumenter')
  })
})
