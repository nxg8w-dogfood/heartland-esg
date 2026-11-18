import { describe, expect, it, vi } from 'vitest'
import { dataverseDocuments } from './documents'

const ok = <T,>(data: T) => ({ success: true, data })
const failed = (message: string) => ({ success: false, data: undefined as never, error: new Error(message) })

function fakeClient() {
  return {
    createRecordAsync: vi.fn(async (_t: string, r: unknown) => ok(r)),
    retrieveMultipleRecordsAsync: vi.fn(async () => ok<Record<string, unknown>[]>([])),
    deleteRecordAsync: vi.fn(async () => ok(undefined)),
    uploadFileToRecord: vi.fn(async () => ok(undefined)),
    downloadFileFromRecord: vi.fn(async () => ok(new Uint8Array([1, 2, 3]))),
  }
}
const file = (name: string, size: number, type = 'application/pdf') => new File([new Uint8Array(size)], name, { type })

describe('dataverseDocuments', () => {
  it('saves a row on the holding, then uploads the file to its file column', async () => {
    const client = fakeClient()
    const doc = await dataverseDocuments(client as never).add('inv-1', file('ESG-rapport 2025.pdf', 2048))
    const [table, record] = client.createRecordAsync.mock.calls[0] as [string, Record<string, unknown>]
    expect(table).toBe('hlesg_dokuments')
    expect(record).toMatchObject({
      hlesg_navn: 'ESG-rapport 2025.pdf', hlesg_stoerrelse: 2048, hlesg_filtype: 'application/pdf',
      'hlesg_Investeringid@odata.bind': '/hlesg_investerings(inv-1)',
    })
    expect(client.uploadFileToRecord).toHaveBeenCalledWith('hlesg_dokuments', record.hlesg_dokumentid, 'hlesg_fil', 'ESG-rapport 2025.pdf', expect.any(File))
    expect(doc).toMatchObject({ id: record.hlesg_dokumentid, investmentId: 'inv-1', name: 'ESG-rapport 2025.pdf', size: 2048 })
  })

  it('deletes the row again when the upload fails, and says why', async () => {
    const client = fakeClient()
    client.uploadFileToRecord.mockResolvedValueOnce(failed('Attachment file size is too big.'))
    await expect(dataverseDocuments(client as never).add('inv-1', file('a.pdf', 10))).rejects.toThrow('Kunne ikke uploade a.pdf: Attachment file size is too big.')
    const id = (client.createRecordAsync.mock.calls[0][1] as Record<string, unknown>).hlesg_dokumentid
    expect(client.deleteRecordAsync).toHaveBeenCalledWith('hlesg_dokuments', id)
  })

  it('refuses a file over 32 MB before sending anything', async () => {
    const client = fakeClient()
    const big = { name: 'stor.pdf', size: 32 * 1024 * 1024 + 1, type: 'application/pdf' } as File
    await expect(dataverseDocuments(client as never).add('inv-1', big)).rejects.toThrow('stor.pdf er større end 32 MB.')
    expect(client.createRecordAsync).not.toHaveBeenCalled()
  })

  it('lists the documents with their holding, page by page', async () => {
    const client = fakeClient()
    client.retrieveMultipleRecordsAsync
      .mockResolvedValueOnce({ ...ok([{ hlesg_dokumentid: 'd1', hlesg_navn: 'a.pdf', hlesg_stoerrelse: 5, hlesg_filtype: 'application/pdf', createdon: '2026-11-18T10:00:00Z', _hlesg_investeringid_value: 'inv-1' }]), skipToken: 'next' } as never)
      .mockResolvedValueOnce(ok([{ hlesg_dokumentid: 'd2', hlesg_navn: 'b.xlsx', _hlesg_investeringid_value: 'inv-2' }]))
    const docs = await dataverseDocuments(client as never).list()
    expect(docs).toEqual([
      { id: 'd1', investmentId: 'inv-1', name: 'a.pdf', size: 5, type: 'application/pdf', uploadedOn: '2026-11-18T10:00:00Z' },
      { id: 'd2', investmentId: 'inv-2', name: 'b.xlsx', size: null, type: '', uploadedOn: null },
    ])
    expect(client.retrieveMultipleRecordsAsync.mock.calls[1]).toEqual(['hlesg_dokuments', expect.objectContaining({ skipToken: 'next' })])
  })

  it('downloads the file as a blob of its type, and deletes the row', async () => {
    const client = fakeClient()
    const store = dataverseDocuments(client as never)
    const blob = await store.download({ id: 'd1', investmentId: 'inv-1', name: 'a.pdf', size: 3, type: 'application/pdf', uploadedOn: null })
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBe(3)
    await store.remove('d1')
    expect(client.deleteRecordAsync).toHaveBeenCalledWith('hlesg_dokuments', 'd1')
  })
})
