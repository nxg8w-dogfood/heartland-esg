// The DocumentStore (../documents.ts) on Dataverse: a hlesg_dokument row per document, with the
// file in its file column (docs/adr/0029). The Power Apps client uploads and downloads the file
// on its own request; Dataverse doesn't take it with the row.

import { getClient, type DataClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../../.power/schemas/appschemas/dataSourcesInfo'
import { schemaName } from '../../dataverse/metadata'
import { newId } from '../../newId'
import { MAX_DOCUMENT_BYTES, type DocumentStore, type StoredDocument } from '../documents'
import { entitySet } from './store'

type Client = Pick<DataClient, 'createRecordAsync' | 'retrieveMultipleRecordsAsync' | 'deleteRecordAsync' | 'uploadFileToRecord' | 'downloadFileFromRecord'>
type Result<T> = { success: boolean; data: T; error?: unknown; skipToken?: string }
type DocumentRecord = Record<string, unknown>

const TABLE = 'hlesg_dokument'
/** The data source the client knows the table by: its entity set */
const SOURCE = entitySet(TABLE)
const FILE = 'hlesg_fil'
const LOOKUP = 'hlesg_investeringid'

function check<T>(r: Result<T>, what: string): T {
  if (!r.success) {
    const e = r.error as { message?: string } | undefined
    throw new Error(`${what}: ${e?.message ?? 'Dataverse afviste ændringen.'}`)
  }
  return r.data
}

const fromRecord = (r: DocumentRecord): StoredDocument => ({
  id: String(r[`${TABLE}id`]),
  investmentId: String(r[`_${LOOKUP}_value`] ?? ''),
  name: typeof r.hlesg_navn === 'string' ? r.hlesg_navn : '',
  size: typeof r.hlesg_stoerrelse === 'number' ? r.hlesg_stoerrelse : null,
  type: typeof r.hlesg_filtype === 'string' ? r.hlesg_filtype : '',
  uploadedOn: typeof r.createdon === 'string' ? r.createdon : null,
})

export function dataverseDocuments(client: Client = getClient(dataSourcesInfo)): DocumentStore {
  return {
    async list() {
      const out: StoredDocument[] = []
      let skipToken: string | undefined
      do {
        const r: Result<DocumentRecord[]> = await client.retrieveMultipleRecordsAsync<DocumentRecord>(SOURCE, {
          select: [`${TABLE}id`, 'hlesg_navn', 'hlesg_stoerrelse', 'hlesg_filtype', 'createdon', `_${LOOKUP}_value`],
          maxPageSize: 5000,
          skipToken,
        })
        out.push(...check(r, 'Kunne ikke læse dokumenterne').map(fromRecord))
        skipToken = r.skipToken
      } while (skipToken)
      return out
    },

    async add(investmentId, file) {
      if (file.size > MAX_DOCUMENT_BYTES) throw new Error(`${file.name} er større end ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`)
      const id = newId()
      const record = {
        [`${TABLE}id`]: id,
        hlesg_navn: file.name.slice(0, 260),
        hlesg_stoerrelse: file.size,
        hlesg_filtype: file.type.slice(0, 200),
        [`${schemaName(LOOKUP)}@odata.bind`]: `/${entitySet('hlesg_investering')}(${investmentId})`,
      }
      check(await client.createRecordAsync(SOURCE, record), `Kunne ikke gemme ${file.name}`)
      // A row without its file documents nothing, so it goes again if the upload fails.
      const uploaded = await client.uploadFileToRecord(SOURCE, id, FILE, file.name, file)
      if (!uploaded.success) {
        await client.deleteRecordAsync(SOURCE, id).catch(() => {})
        check(uploaded, `Kunne ikke uploade ${file.name}`)
      }
      return { id, investmentId, name: record.hlesg_navn, size: file.size, type: file.type, uploadedOn: new Date().toISOString() }
    },

    async download(document) {
      const data = check(await client.downloadFileFromRecord(SOURCE, document.id, FILE), `Kunne ikke hente ${document.name}`)
      return new Blob([data as BlobPart], { type: document.type || 'application/octet-stream' })
    },

    async remove(id) {
      check(await client.deleteRecordAsync(SOURCE, id), 'Kunne ikke slette dokumentet')
    },
  }
}
