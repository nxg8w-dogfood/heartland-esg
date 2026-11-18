// Documents on a category 15 holding, such as the company's own ESG report (docs/adr/0029).
// They're files in Dataverse, uploaded and deleted the moment the user adds or removes one,
// apart from the group's save. The browser draft has nowhere to keep them, so it offers none.

import { createContext, useContext } from 'react'

export type StoredDocument = {
  id: string
  /** The holding it documents */
  investmentId: string
  name: string
  /** Bytes, or null if not known */
  size: number | null
  /** MIME type, or '' */
  type: string
  /** When it was uploaded, ISO, or null if not known */
  uploadedOn: string | null
}

export type DocumentStore = {
  /** Every document the user may read */
  list(): Promise<StoredDocument[]>
  /** Saves the file on the holding, which must already be saved */
  add(investmentId: string, file: File): Promise<StoredDocument>
  download(document: StoredDocument): Promise<Blob>
  remove(id: string): Promise<void>
}

/** The largest file a document may be: the file column's limit (src/dataverse/schema.ts). */
export const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024

export type Documents = {
  store: DocumentStore
  /** Whether every holding is saved, so a new one exists for a document to point to */
  saved: boolean
}

/** null where there's nowhere to keep documents: outside Power Apps. */
export const DocumentsContext = createContext<Documents | null>(null)

export const useDocuments = () => useContext(DocumentsContext)
