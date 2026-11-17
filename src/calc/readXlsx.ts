// Reads .xlsx sheets without Web Workers. The Power Apps host serves code
// apps with `worker-src 'none'`, so a worker is blocked and the read never finishes. The
// library's /browser build parses in a worker, and its unzip (fflate) inflates entries over
// 512 KB in one. So: unzip here synchronously, re-pack the XML parts uncompressed (stored
// entries are just sliced, never inflated) and parse with the /universal build, which has no
// worker at all.

import { unzipSync, zipSync } from 'fflate'
import readXlsxFile, { readSheet } from 'read-excel-file/universal'
import type { CellValue } from './ledger'

/** The parts read-excel-file reads; images, printer settings and the like are left out. */
const isXmlPart = (name: string) => /\.(xml|rels)$/i.test(name)

async function stored(input: Blob | ArrayBuffer): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(input instanceof Blob ? await input.arrayBuffer() : input)
  const parts = unzipSync(bytes, { filter: (f) => isXmlPart(f.name) })
  return zipSync(parts, { level: 0 }).buffer as ArrayBuffer
}

/** The first sheet of an .xlsx file, as rows of cells. Throws on a file that isn't one. */
export async function readXlsxSheet(input: Blob | ArrayBuffer): Promise<CellValue[][]> {
  return (await readSheet(await stored(input))) as CellValue[][]
}

/** Every sheet of an .xlsx file, by name, in workbook order. */
export async function readXlsxSheets(input: Blob | ArrayBuffer): Promise<{ name: string; grid: CellValue[][] }[]> {
  return (await readXlsxFile(await stored(input))).map((s) => ({ name: s.sheet, grid: s.data as CellValue[][] }))
}
