# 17. Category 15 is imported from the group's consolidation export

- **Status:** Proposed
- **Date:** 2026-11-13
- **Decided by:** open — @mortengad (tech lead) after the ESG owner has tried it
- **Asked for by:** @mortengad, 2026-11-13, from three sheets exported by the group's
  consolidation system: Ownership Percentage (CL), Net Turnover and Investment Amount.

## Context

Category 15 holdings were typed in by hand, one card per company: name, ownership percentage,
revenue and a factor. Heartland's group holds hundreds of legal entities, so that doesn't
scale, and the figures already exist in the group's consolidation system.

The ESG owner can export from that system; nobody else on the project has access to it. Each
export is one measure for every entity, with a column per period:

```
InternalExternal    Intern
Measures            Value DKK
Time Calculations   YTD
Analysis            Actual
Account Internal    Ownership Percentage (CL)   <- which measure this file holds

                    Year-Month
FriendlyName        July 2025     July 2026
Alfa Holding        1,00          1,00
```

## Decision

1. **The app reads that layout as it is** (`src/calc/groupExport.ts`), rather than asking for a
   reshaped file. `Account Internal` says which measure the file holds, the first row with a
   label and at least one period heading is the header row, and everything below it is an
   entity. The rest of the header block is kept and shown, so the user can check what they
   picked in the source system. Empty columns in front are dropped, because the Excel add-in
   saves the grid at C3 (added 2026-11-17). The cube's own rows that aren't entities,
   *Not Available* and *(Transactions on …)*, are skipped.
2. **One export per measure, joined on the entity name.** The ESG owner adds the files one at a
   time; a second export of the same measure replaces the first. A workbook can hold every
   measure, one per sheet. Each sheet is read, and sheets that aren't exports (the add-in's
   *XLCubedFormats*) are passed over (added 2026-11-17).
3. **Only holdings of 50 % or less become category 15 rows.** Larger ones are consolidated into
   Scope 1 and 2, as ADR 0006 and `src/calc/investments.ts` already say. They're listed in the
   preview as *Konsolideret — ikke kategori 15*, not imported.
4. **Nothing changes until the preview is accepted.** The preview shows each company with the
   ownership, revenue and investment amount that would be written, and whether it's new or an
   update.
5. **A company already in the same calendar year is updated; another year is a new row,**
   because each holding stands for the calendar year it's dated in. *Superseded 2026-11-17 by
   ADR 0023: a holding covers the 12 months up to its date, and the import updates the same
   company on the same date.*
6. **Net Turnover is negated.** Income is a credit in the source system, so it arrives negative.
7. **Ownership is read as a share (1,00 = 100 %)** when most values are at most 1, and as a
   percentage otherwise. It was "every value" until 2026-11-17, when a real export's
   *Not Available* row (45,45) turned every 100 % holding into 1 %. The preview shows the
   resulting percentage, so a wrong reading is visible before anything is imported. A share
   that rounds to 0,0000 % or below, which is what's left of a sold holding, counts as no
   holding.
8. **Investment Amount is shown but not calculated from.** *Superseded 2026-11-17 by ADR 0022:
   the amount is now stored, and a holding with one is estimated as amount × sector factor, as the
   data manual says.* The app's `Investment` basis has
   never been calculated (`src/calc/investments.ts`): the GHG Protocol's investment-specific
   method needs the investee's own emissions, or revenue × a factor. Using the amount itself
   would be a new method and needs its own decision.
9. **The emission factor is not imported.** Imported holdings are *Mangler data* until the ESG
   owner picks kg CO2e per EUR, because the export has no factor and guessing one would put an
   unsourced number in the climate account.

## Options considered

- **A reshaped file (one row per company, named columns), like the ledger import (rejected).**
  It would reuse the existing import, but the ESG owner would have to rebuild the export by hand
  every time, which is the work this removes.
- **The cube's company table, keyed by OrganizationID (adopted 2026-11-18).** See ADR 0025: it
  replaces the name as the key wherever the export has one.
- **Reading the consolidation system over its API or an MCP server (not chosen now).** It would
  remove the file step, but the system is reachable only by the ESG owner, a code app can't call
  another host until an admin allows it (ADR 0011), and nothing is agreed about credentials.
  Worth revisiting once the file import has proved the mapping is right.
- **Creating the group's companies from the ownership export too (not chosen now).** The same
  file says which entities are subsidiaries, so the Koncern page could be built from it. That
  changes the structure of the whole group — each company carries a climate account — so it
  waits until this import has been tried on real data.
- **Importing Investment Amount as the basis for emissions (rejected, then adopted).** See
  decision 8 and ADR 0022.

## Consequences

- The ESG owner can fill category 15 from three exports instead of typing every holding.
- The import depends on the source system's column names (`Account Internal`, `Year-Month`) and
  on its period headings. If the export is set up differently, the app says what it couldn't find
  rather than importing something wrong.
- Imported holdings don't count until a factor is chosen, so the category 15 total stays 0 until
  the ESG owner has been through them.
- YTD exports are flagged: category 15 treats revenue as an annual figure, so a year-to-date
  column understates a full year. Since ADR 0023 the flag is shown only when the period isn't
  July, the last month of the fiscal year.
- This ADR stays **Proposed** until the ESG owner has run it on a real export and @mortengad has
  accepted the mapping.
