import { useState, type ReactNode } from 'react'
import { useConfirm } from '../confirm'
import { useDocumentList, type DocumentKind } from '../storage/documents'
import { DocumentsPanel } from './DocumentsPanel'

/**
 * Documents on the rows of a table (ADR 0035): a "Dokumenter" button in a row's actions opens
 * its documents in a row below it. Nothing is shown where there's nowhere to keep documents,
 * outside Power Apps, or without a kind. Deleting a row deletes its documents in Dataverse too, so `confirmDelete`
 * asks first when it has any.
 */
export function useRowDocuments(kind: DocumentKind | null, what: string, example: string) {
  const documents = useDocumentList(kind)
  const { confirm, dialog } = useConfirm()
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const panelId = (id: string) => `docs-${kind}-${id}`

  return {
    /** Render once in the component */
    dialog,
    /** The row's button that opens and closes its documents */
    toggle(id: string, owner: string): ReactNode {
      if (!documents.store) return null
      const isOpen = open.has(id)
      const n = documents.count(id)
      return (
        <button
          type="button"
          className="link"
          aria-expanded={isOpen}
          aria-controls={panelId(id)}
          onClick={() => setOpen((o) => { const s = new Set(o); if (isOpen) s.delete(id); else s.add(id); return s })}
        >
          Dokumenter{n > 0 && ` (${n})`}<span className="visually-hidden"> for {owner}</span>
        </button>
      )
    },
    /** The row below a row with its documents, while open */
    panel(id: string, owner: string, colSpan: number): ReactNode {
      if (!documents.store || !open.has(id)) return null
      return (
        <tr id={panelId(id)} className="documents-row">
          <td colSpan={colSpan}>
            <DocumentsPanel parentId={id} owner={owner} what={what} example={example} documents={documents} confirm={confirm} />
          </td>
        </tr>
      )
    },
    /** Asks before deleting a row with documents, which go with it; true to go ahead */
    async confirmDelete(id: string, owner: string): Promise<boolean> {
      const n = documents.count(id)
      if (n === 0) return true
      return confirm(`Slet ${owner}? ${n === 1 ? 'Dens dokument' : `Dens ${n} dokumenter`} slettes også. Det kan ikke fortrydes.`)
    },
  }
}
