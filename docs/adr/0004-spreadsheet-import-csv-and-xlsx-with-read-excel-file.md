# 4. Ledger import: CSV first, XLSX with read-excel-file, no SheetJS

- **Status:** Accepted
- **Date:** 2026-09-30
- **Decided by:** @mortengad (tech lead)

## Context

The original app imported ledger postings from CSV, XLS and XLSX, reading all three with
SheetJS. The SheetJS release on the public npm registry (`xlsx` 0.18.5) has known
high-severity vulnerabilities, and newer releases are only published on SheetJS's own CDN.
Adding it would fail `npm audit` in CI and break the *dependencies patched inside the agreed
window* control. Most Danish finance systems (e-conomic, Dinero, Business Central) export CSV,
and Excel users can save any sheet as CSV or XLSX.

## Decision

1. **CSV stays the main format** and is read by our own parser (`parseCsv` in
   `src/calc/ledger.ts`), with no dependency: semicolon, comma or tab; quoted fields; a byte
   order mark; Windows-1252 files are detected.
2. **XLSX is read with [`read-excel-file`](https://gitlab.com/catamphetamine/read-excel-file)**
   (MIT, actively maintained, 0 known vulnerabilities at 9.3.10), from its browser entry. It's
   loaded only when an Excel file is chosen, as its own chunk. Only the first sheet is read.
   Spreadsheet cells then go through the same code as CSV (`tableToRows`, `rowsToPostings`):
   date cells become ISO dates, and so do date serials that lost their date format.
3. **Old binary XLS (Excel 97–2003) isn't supported.** The user is told to save as XLSX or CSV.

## Options considered

- **SheetJS from npm (rejected).** It has known high-severity vulnerabilities and would fail the
  audit in CI.
- **SheetJS from its CDN tarball (rejected).** It's current and supports XLS, but Dependabot
  can't update a tarball URL, so patching would be manual and easy to miss.
- **CSV only (not chosen alone).** It's the simplest option, but users would have to convert
  every XLSX export by hand.
- **ExcelJS (not chosen).** It reads XLSX too, but it's much larger, and we only need to read
  one sheet.

## Consequences

- Dependabot keeps `read-excel-file` updated like any other npm package.
- An integration test (`src/calc/xlsx.test.ts`) builds a real `.xlsx` file with `fflate` (a
  dev dependency) and reads it through the library's browser entry. So a library update that
  changes how cells come out fails CI.
- If XLS support becomes necessary, it needs a new decision; this ADR doesn't cover it.
