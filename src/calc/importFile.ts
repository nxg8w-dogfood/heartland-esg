// Reading a file the user picked, for every import in the app: the ledger from the finance
// system and the exports from the group's consolidation system. Returns the cells as written;
// what they mean is each import's own business.

import { parseCsvGrid, type CellValue } from './ledger'

export class ImportFileError extends Error {}

/** Reads text as UTF-8, falling back to Windows-1252 (common in Danish exports) if it isn't valid. */
export async function readText(file: Blob): Promise<string> {
  const bytes = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf8
}

const isXlsxName = (file: File) =>
  /\.xlsx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * The cells of a CSV or of the first sheet of an .xlsx file. The Excel reader is loaded only
 * when an Excel file is chosen.
 */
export async function readGrid(file: File): Promise<CellValue[][]> {
  checkType(file)
  if (!isXlsxName(file)) return parseCsvGrid(await readText(file))
  const { readXlsxSheet } = await import('./readXlsx')
  return readXlsxSheet(file)
}

/** Every sheet of an .xlsx file, or a CSV as one sheet named after the file. */
export async function readSheets(file: File): Promise<{ name: string; grid: CellValue[][] }[]> {
  checkType(file)
  if (!isXlsxName(file)) return [{ name: file.name, grid: parseCsvGrid(await readText(file)) }]
  const { readXlsxSheets } = await import('./readXlsx')
  return readXlsxSheets(file)
}

function checkType(file: File) {
  if (/\.xls$/i.test(file.name)) {
    throw new ImportFileError('Gamle Excel-filer (XLS, Excel 97–2003) understøttes ikke. Gem filen som XLSX eller CSV og prøv igen.')
  }
  if (!isXlsxName(file) && !/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
    throw new ImportFileError('Vælg en CSV- eller XLSX-fil.')
  }
}
