import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DocumentStore, StoredDocument } from '../storage/documents'
import { InvestmentDocuments } from './InvestmentDocuments'

const store = {} as DocumentStore
const doc = (o: Partial<StoredDocument> = {}): StoredDocument => ({
  id: 'd1', investmentId: 'inv-1', name: 'ESG-rapport 2025.pdf', size: 2_500_000, type: 'application/pdf', uploadedOn: '2026-11-18T10:00:00Z', ...o,
})
const render = (props: Partial<Parameters<typeof InvestmentDocuments>[0]>) => renderToStaticMarkup(
  <InvestmentDocuments
    investmentId="inv-1" company="Delejet ApS" documents={{ store, saved: true }} list={[]} loadError={null}
    onChange={() => {}} confirm={async () => true} {...props}
  />,
)

describe('InvestmentDocuments', () => {
  it('lists the documents to download or delete, with size and date', () => {
    const html = render({ list: [doc()] })
    expect(html).toContain('ESG-rapport 2025.pdf<span class="visually-hidden"> (hent)</span></button><span class="sub">2,4 MB · tilføjet 18.11.2026</span>')
    expect(html).toContain('Slet<span class="visually-hidden"> ESG-rapport 2025.pdf</span>')
  })

  it('takes several files at once, up to 32 MB each', () => {
    const html = render({})
    expect(html).toContain('Ingen dokumenter endnu.')
    expect(html).toMatch(/Tilføj dokument<span class="optional"> \(fx selskabets ESG-rapport, højst 32 MB\)<\/span><\/label><input id="[^"]+" type="file" multiple=""/)
  })

  it('waits for the holding to be saved before a file can be added', () => {
    const html = render({ documents: { store, saved: false } })
    expect(html).toMatch(/type="file" multiple="" disabled=""/)
    expect(html).toContain('Dokumenter kan tilføjes, når investeringen er gemt.')
  })

  it('says while loading, and when loading failed', () => {
    expect(render({ list: null })).toContain('Henter dokumenter …')
    expect(render({ loadError: 'Kunne ikke læse dokumenterne: nej' })).toContain('<p class="error" role="alert">Kunne ikke læse dokumenterne: nej</p>')
  })

  it('explains that documents need Power Apps', () => {
    const html = render({ documents: null })
    expect(html).toContain('Dokumenter kan kun gemmes, når appen kører i Power Apps.')
    expect(html).not.toContain('type="file"')
  })
})
