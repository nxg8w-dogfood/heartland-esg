# 25. Category 15 is imported from the cube's company table, by OrganizationID

- **Status:** Accepted
- **Date:** 2026-11-18
- **Decided by:** @mortengad (tech lead), 2026-11-18, on receiving the first company table from
  the AFC cube (*Revenue, investment og ejerandel juli 2026.xlsx*).

## Context

The first exports from the consolidation system (ADR 0017) had one sheet per measure, each with
its own row dimension. Ownership and revenue were listed by FriendlyName and the investment
amount by *Organization Held Original*. Joining them on the name matched only a handful of
investment amounts (ADR 0022). FriendlyName isn't unique either: dozens of companies are
*Not Available*.

The new workbook is a table with one row per company, keyed by **OrganizationID**, the cube's
unique key. Its columns are OrganizationName, FriendlyID, FriendlyName, Division, BusinessArea,
OwnershipType (Subsidiary, Associated, Other, Cost, Convertible, NA) and one column per measure
for the month, e.g. *Revenue juli 2026 (DKK)*. A summary sheet (*Samlet*) looks every measure up
from three data sheets of the same layout. The revenue's sign has already been reversed, so it
is positive. A notes sheet explains the setup: July 2026, YTD, i.e. the fiscal year 2025/26.

## Decision

1. **A sheet with an `OrganizationID` column is read as a company table.** Each measure column
   becomes an export of its own, for the month its heading (or the title above) names. The
   cube's own layout is still read as before.
2. **Companies are matched on OrganizationID.** Across sheets, and against holdings already in
   the app on the same date. A holding saved before it had an OrganizationID is matched on its
   name, as before.
3. **The holding stores its OrganizationID and business area**, in
   `hlesg_investering.hlesg_organisationid` and `hlesg_forretningsomraade`. The ID makes the
   next import update the right holding even if the name changes. The business area is shown on
   the holding, because it's the sector the data manual's factor is chosen for (ADR 0022).
4. **The name is the FriendlyName, or the OrganizationName when the FriendlyName is
   *Not Available*,** so companies that share it can be told apart.
5. **Revenue's sign is read from the values.** If most are negative, the export is the cube's own
   and the credit is reversed; if most are positive, it's taken as it is.
6. **OwnershipType sets the accounting method:** *Associated* becomes *Ass.*, everything else
   *Other investments*. Which holdings count is unchanged: those of 50 % or less (ADR 0006,
   ADR 0017), whatever the cube's type. @mortengad decided on 2026-11-18 that subsidiaries at
   50 % or less and companies with no type are included. The preview shows the cube's type next
   to each one.
7. **A measure found on two sheets is read from the one with more companies.** The summary's
   lookups are only as good as the last time Excel calculated them; the data sheets hold the
   values themselves.

## Options considered

- **Read only the summary sheet (rejected).** It has every measure in one place, but its values
  are cached formula results. A file saved without recalculating would import empty cells.
- **Classify holdings by OwnershipType instead of the 50 % rule (rejected 2026-11-18).** It's
  the group's own classification, but it would leave out subsidiaries at 50 % or less and
  companies with no type. @mortengad decided they must be included.
- **Match on FriendlyName as before (rejected).** It isn't unique, and the investment amounts
  wouldn't match.

## Consequences

- In the July 2026 table, 79 holdings are at 50 % or less. 67 of them now have an investment
  amount, against 4 before. 3 more have only revenue, and 9 have neither.
- Three companies the cube calls *Subsidiary* are at 50 % or less and are imported. Eight
  companies with no type (FriendlyName *Not Available*) are imported too. Both are included by
  decision.
- The two columns have to be applied to each environment (ADR 0007) before this ships there;
  the deploy stops if they're missing (ADR 0020). Dev has them from 2026-11-18.
- The business area isn't yet used to choose a factor. A mapping from business area to a sector
  factor would let the import fill the factor in, and is a separate decision.
