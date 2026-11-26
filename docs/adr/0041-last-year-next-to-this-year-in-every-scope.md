# 41. Last year next to this year, in every scope

- **Status:** Proposed
- **Date:** 2026-11-26
- **Decided by:** open. Proposed by @mortengad (tech lead) on Line's (Heartland's ESG owner)
  request of 2026-11-26.

## Context

Line asked, on 2026-11-26, to see under each scope what each unit emitted last year, for
example on hover so it doesn't take up much room. ADR 0040 did this for category 15, where a
holding is linked to the year before by its OrganizationID.

The other scopes have nothing like that, but two things make it possible without new data:

- **All dates are in one place.** A company's lines for every year are stored in the same
  account. Each line has a date, or a date range, and is counted for the share that falls in
  the chosen period. So last year's lines are already there. They are simply outside the
  period.
- **Lines carry what they are about.** A line is a monthly bill, a trip, a waste pickup or a
  posting. Comparing one line with another year's makes no sense, because the bills don't
  match one for one. But each line already names the thing it is about: a location, a car, a
  fuel, a waste fraction, a spend group or an account. That thing is what Line calls the
  *unit*.

## Proposal

### 1. Last year is the same period, a year earlier

For 1.8.2025–31.7.2026, last year is 1.8.2024–31.7.2025. For a quarter, it is the same quarter
a year earlier.

This compares a season with the same season, so heating in winter is set against last winter.
It needs no period called "last year" to exist: lines are counted for any date range.

### 2. A unit per scope, from fields the lines already have

| Where | Unit (the year-to-year key) | Field |
|---|---|---|
| Scope 1, cars | the car | `vehicleId` (the plate) |
| Scope 1, other | the fuel or refrigerant group | `group` |
| Scope 2 | the location and kind (el / fjernvarme) | `locationId`, `kind` |
| Category 1, spend lines | the spend group | `group` |
| Category 1, Kontoplan | the account | `account` on the posting |
| Category 3 | the Scope 1 or 2 unit it is derived from | as above |
| Category 4 | the transport mode, or the spend group | `group` |
| Category 5 | the location and waste fraction | `locationId`, `group` |
| Category 6 | the travel type, e.g. hotel nights in a country | `group` |
| Category 7 | the transport mode in the survey | the survey's modes |
| Category 15 | the holding | OrganizationID (ADR 0040) |

Last year for a unit is computed the same way as this year: the same calculation over the
earlier period, from the same lines and factor table.

### 3. Shown where the unit is shown, short on the line and the details on hover

- Each unit's subtotal row, such as a location's "i alt", a car, or a group, shows
  "Sidste år: x t". Hovering shows the period, the quantity (kWh, litres, km, kg or DKK) and
  the factor.
- The same text is there for screen readers, as in ADR 0040, because a tooltip alone can't be
  reached by keyboard or touch.
- Individual lines get nothing. A March bill has no "last year" of its own.
- The scope and category totals show last year and the change in percent, e.g. "Sidste år
  412 t · −8 %".

### 4. Last year is recalculated, not stored

Last year is calculated live from the lines, with the factors valid on their dates.

Choosing another factor source on Faktorer can therefore change last year's figure too. That
is intended: it makes the two years comparable on the same factors. What was reported for a
year should be locked when the year is closed. That belongs to a "close the year" feature,
which this ADR does not cover.

## Options considered

- **Store a snapshot per unit each year (rejected for now).** It would keep the numbers as
  reported. But it needs a table, a moment to take the snapshot, and handling of corrections.
  It belongs with closing a year.
- **Link each line to last year's line (rejected).** Lines don't match one for one, and every
  line would need a link someone has to keep up.
- **The immediately preceding period as "last year" (rejected).** For a quarter that would be
  the previous quarter, which mixes seasons. It would also depend on how the periods were set
  up.

## Open questions for Line

1. Are these the units she means, especially for Kontoplan: per account, or per category or
   rule?
2. For a quarter, should last year be the same quarter a year earlier?
3. Should the totals also show the change in percent, or only last year's figure?
4. Is it right that last year follows today's factor choices until a year is closed, or should
   last year keep the factors it was reported with?

## Consequences

- No schema change. It is a calculation over lines that are already stored, plus display.
- A unit with nothing last year shows "Sidste år: —". A unit that existed only last year isn't
  listed, because there is nothing this year to show it next to.
- Calculation time doubles on each page, since every page runs a second period. That is
  cheap: each page already computes from the full list of lines.
