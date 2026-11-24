// Documents on a category 15 holding (docs/adr/0029), and on a Scope 3 line or commuting survey
// (docs/adr/0035), such as the company's ESG report or a supplier's invoice. They're files in
// Dataverse, uploaded and deleted the moment the user adds or removes one, apart from the group's
// save. The browser draft has nowhere to keep them, so it offers none.

import { createContext, useContext, useEffect, useState } from 'react'

/** What a document belongs to: a holding, a line, or a commuting survey */
export type DocumentKind = 'investment' | 'line' | 'survey'

export type StoredDocument = {
  id: string
  /** The holding, line or survey it documents */
  parentId: string
  name: string
  /** Bytes, or null if not known */
  size: number | null
  /** MIME type, or '' */
  type: string
  /** When it was uploaded, ISO, or null if not known */
  uploadedOn: string | null
}

export type DocumentStore = {
  /** Every document of its kind the user may read */
  list(): Promise<StoredDocument[]>
  /** Saves the file on the holding, line or survey, which must already be saved */
  add(parentId: string, file: File): Promise<StoredDocument>
  download(document: StoredDocument): Promise<Blob>
  remove(id: string): Promise<void>
}

export type DocumentStores = Record<DocumentKind, DocumentStore>

/** The largest file a document may be: the file column's limit (src/dataverse/schema.ts). */
export const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024

export type Documents = {
  stores: DocumentStores
  /** Whether everything is saved, so a new holding, line or survey exists for a document to point to */
  saved: boolean
}

/** null where there's nowhere to keep documents: outside Power Apps. */
export const DocumentsContext = createContext<Documents | null>(null)

export const useDocuments = () => useContext(DocumentsContext)

/** Every document of one kind, loaded once, so each row can say how many it has. No kind: none. */
export function useDocumentList(kind: DocumentKind | null) {
  const documents = useDocuments()
  const store = (kind && documents?.stores[kind]) ?? null
  const [docs, setDocs] = useState<StoredDocument[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!store) return
    let cancelled = false
    store.list().then(
      (ds) => { if (!cancelled) setDocs(ds) },
      (e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Kunne ikke hente dokumenterne.') },
    )
    return () => { cancelled = true }
  }, [store])
  return {
    /** null outside Power Apps */
    store,
    saved: documents?.saved ?? false,
    error,
    /** One parent's documents; null while they load */
    of: (parentId: string) => docs && docs.filter((d) => d.parentId === parentId),
    count: (parentId: string) => docs?.filter((d) => d.parentId === parentId).length ?? 0,
    update: (f: (docs: StoredDocument[]) => StoredDocument[]) => setDocs((ds) => f(ds ?? [])),
  }
}

export type DocumentList = ReturnType<typeof useDocumentList>
