import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DocumentList, DocumentStore, StoredDocument } from '../storage/documents'
import { DocumentsPanel } from './DocumentsPanel'

const store = {} as DocumentStore
const doc = (o: Partial<StoredDocument> = {}): StoredDocument => ({
  id: 'd1', parentId: 'inv-1', name: 'ESG-rapport 2025.pdf', size: 2_500_000, type: 'application/pdf', uploadedOn: '2026-11-18T10:00:00Z', ...o,
})
const list = (docs: StoredDocument[] | null, o: Partial<DocumentList> = {}): DocumentList => ({
  store, saved: true, error: null, of: () => docs, count: () => docs?.length ?? 0, update: () => {}, ...o,
})
const render = (documents: DocumentList, what = 'investeringen', example = 'selskabets ESG-rapport') => renderToStaticMarkup(
  <DocumentsPanel parentId="inv-1" owner="Delejet ApS" what={what} example={example} documents={documents} confirm={async () => true} />,
)

describe('DocumentsPanel', () => {
  it('lists the documents to download or delete, with size and date', () => {
    const html = render(list([doc()]))
    expect(html).toContain('ESG-rapport 2025.pdf<span class="visually-hidden"> (hent)</span></button><span class="sub">2,4 MB · tilføjet 18.11.2026</span>')
    expect(html).toContain('Slet<span class="visually-hidden"> ESG-rapport 2025.pdf</span>')
  })

  it('takes several files at once, up to 32 MB each', () => {
    const html = render(list([]))
    expect(html).toContain('Ingen dokumenter endnu.')
    expect(html).toMatch(/Tilføj dokument<span class="optional"> \(fx selskabets ESG-rapport, højst 32 MB\)<\/span><\/label><input id="[^"]+" type="file" multiple=""/)
  })

  it('waits for the holding or line to be saved before a file can be added', () => {
    expect(render(list([], { saved: false }))).toContain('Dokumenter kan tilføjes, når investeringen er gemt.')
    const html = render(list([], { saved: false }), 'linjen', 'en faktura')
    expect(html).toMatch(/type="file" multiple="" disabled=""/)
    expect(html).toContain('Dokumenter kan tilføjes, når linjen er gemt.')
    expect(html).toContain('(fx en faktura, højst 32 MB)')
  })

  it('says while loading, and when loading failed', () => {
    expect(render(list(null))).toContain('Henter dokumenter …')
    expect(render(list([], { error: 'Kunne ikke læse dokumenterne: nej' }))).toContain('<p class="error" role="alert">Kunne ikke læse dokumenterne: nej</p>')
  })

  it('explains that documents need Power Apps', () => {
    const html = render(list([], { store: null }))
    expect(html).toContain('Dokumenter kan kun gemmes, når appen kører i Power Apps.')
    expect(html).not.toContain('type="file"')
  })
})
