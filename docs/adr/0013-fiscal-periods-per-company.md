# 13. Fiscal periods per company, chosen next to the company

- **Status:** Proposed
- **Date:** 2026-11-11
- **Decided by:** @mortengad (tech lead), 2026-11-11: periods per company, picked next to the
  company selector instead of date fields; the Koncern page reports on the period picked there.

## Context

Until now each company's account had one reporting period, a start and an end date, edited with
two date fields above the Scope 1, 2 and 3 pages. The Koncern page had its own pair of date
fields for the group summary. Every calculation takes a `{ start, end }` range: a dated line
counts for the share of its days inside the range (`src/calc/dates.ts`), and annual figures for
the share of their year.

Companies in the group don't share a fiscal year (some run July to June), and people report on
the same few years again and again. The request was to define fiscal periods per company and
pick one next to the company selector, instead of typing dates.

The original app (`reference/heartland-klimaregnskab-app.html`) had saved periods ("gemte
perioder"): a label and two dates, chosen from a list. Deleting one deleted only "the shortcut";
the period was a filter and the lines kept their own dates.

## Decision

1. **A period is a named date range that filters lines by their dates.** `FiscalPeriod` is
   `{ id, name, start, end }` (`src/calc/periods.ts`). Lines don't belong to a period; they keep
   their own dates, as in the original app, so a quarterly bill across a year end still splits
   by days. The calculations are unchanged: they get the selected period's start and end.
2. **Each company has one or more periods** (`AccountData.periods`). A period needs a name not
   used by another of the company's periods, two real dates with the start before the end, and
   no day in common with another period. The last period can't be deleted. Deleting a period
   deletes no data.
3. **Periods are edited per company on the Koncern page**, in the company's box under
   *Virksomheder og ejerandele*, next to its name and ownership shares. *Tilføj periode*
   suggests the period after the latest, as long as it, so it's valid from the start. A change
   is kept only once the row is valid; until then the row says what's wrong.
4. **The header has a period picker next to the company picker**, listing the active company's
   periods, latest first. The selected period is the user's view, like the open company: in
   the group (`activePeriodId`) for the browser draft, and in the browser's view prefs for
   Dataverse, never in a shared table. Opening another company keeps a period with the same
   dates, or else the same name, and otherwise picks the company's latest.
5. **The Koncern page reports on the period picked in the header**, for every company on the
   same dates (decided 2026-11-11). It says which period that is. Its own date fields are gone.
6. **Storage.** A new table, `hlesg_regnskabsperiode` (name, `hlesg_startdato`,
   `hlesg_slutdato`, parent `hlesg_virksomhedid`), with the app's id as its primary key. Writing
   periods is part of *Klimaregnskab – Ansvarlig*, like the account's other settings; every role
   that reads a company reads its periods.
7. **Migration.**
   - Backups and the browser draft: account version 3. A version 1 or 2 account's `period`
     becomes its first period, named `2025` for a calendar year, `2025/26` for a twelve-month
     year from the first of a month, and by its dates otherwise; the app says so once loaded.
     A group's old `summaryPeriod` is dropped. An account with no usable period gets last
     calendar year.
   - Dataverse: the old `hlesg_periodestart` and `hlesg_periodeslut` on `hlesg_klimaregnskab`
     stay (the apply script never deletes columns) but are only read. A company without period
     rows gets a period from them on load, keyed by the company's id, so every load makes the
     same one. It's created in Dataverse only when someone changes it, so a *Bidragyder*, who
     may not write periods or settings, can still save lines.

## Options rejected

- **Lines belong to a period** (a period id on each line). It would split the data by period,
  make a line across a year end belong to one side, and need every line re-tagged when a period
  changes. The original app filtered by date, and so does this.
- **One set of periods for the whole group.** Companies have different fiscal years, which is
  the point of the request. The Koncern page still sums on one set of dates, the selected ones.
- **Each company summed over its own period on the Koncern page** (e.g. each company's "2025").
  Offered on 2026-11-11 and not chosen: it mixes different dates into one total, and needs a
  rule for companies without a matching period.
- **Periods as a JSON column on `hlesg_klimaregnskab`.** No new table, but Dataverse couldn't
  show, audit or check periods as records, and every edit would rewrite the whole list.
- **Keep the date fields for a custom range next to the picker.** The request was to replace
  them. A one-off range can be added as a period and deleted again without losing data.
- **Write the migrated period to Dataverse on the first save.** That save could be a
  *Bidragyder*'s, who isn't allowed to create periods, and their line edits would fail with it.

## Consequences

- `hlesg_regnskabsperiode` has to exist in an environment, with its data source generated, before
  a build that uses it is deployed there. Without the table, loading fails.
- The old range columns stay in Dataverse, unused once a company has periods. They can be
  removed by hand later; the schema keeps them listed until then so they're read for migration.
- Backups made by this version (account version 3) can't be loaded by an older version.
