# 43. A publication can restate another party's factor, and the source names that party

- **Status:** Accepted
- **Date:** 2026-11-27
- **Decided by:** Line Høgh Norvang (ESG owner), 2026-11-27: "Jeg kan se at kilden under søgning
  på emissionsfaktor kommer forkert - kilden er Exiobase, BEIS, Energistyrelsen mv."

## Context

A factor's source can be chosen on the Faktorer page (ADR 0033): the built-in table, a
publication, an entered value or an API. Choosing a publication took its value **and** put the
publication's name in the factor's `source`, which the Kilde column shows everywhere, the factor
search included (ADR 0037).

That is right for the publications that are themselves the source — Energistyrelsen's
El-emissionsfaktoren, Energinet's Generelle Eldeklaration, DESNZ's conversion factors. It is
wrong for *Heartland, Emissionsfaktorer i klimaregnskabsmodellen 2025/26* (ADRs 0033 and 0039),
which is the company's own compiled list. Its 49 rows are other parties' figures: 41 EXIOBASE
spend factors, the BEIS rent factor, DESNZ petrol, Energinet electricity, Kredsløb district
heating, and the grid loss and WTT ratio for Scope 3.3.

So after *Brug for alle*, Kilde read "Heartland, Emissionsfaktorer i klimaregnskabsmodellen
2025/26" on all 49 — the spreadsheet that transcribed the data, not the data's origin. A climate
account has to cite where a figure came from, and the GHG Protocol's reporting requirements ask
for the source of the emission factors used.

Falling back to the factor's own built-in source does not work either: 44 of the 49 rows exist in
the built-in table precisely because they had no value, so their source reads "Afventer
indtastning — må ikke gættes". That next to a real value is worse than naming the list.

## Decision

- A publication may carry `originators`: factor id → the party whose figure it restates.
- Where a factor has an originator, choosing that publication sets `source` to the originator and
  `reference` to "«originator», gengivet i «row» («document»)", so the account cites the origin
  and the audit trail still names the list and the row the value was read from.
- Where it has none, the publication is the source and nothing changes.
- Heartland's list gets an originator for every one of its 49 rows, each taken from ADR 0039's
  row-by-row account of the file and from the list's own note — nothing is inferred beyond them:
  EXIOBASE (kg CO2e per EUR, factor year 2021) for the 41 spend factors, BEIS for the rent factor
  and the WTT ratio, DESNZ 2025 for petrol, Energinet for the two 200 %-method electricity
  factors, the general declaration and the grid loss, and Kredsløb for Aarhus district heating.
  A test fails if a row of that list has no originator.

### Rejected

- **A flag per publication instead of a party per factor.** One flag cannot say which of the six
  originators a given row came from, and the built-in source cannot stand in for it.
- **Writing the originators into the built-in table's `source`.** The built-in source must keep
  saying "awaiting a value" while there is none, so nobody reads a blank factor as sourced
  (ADRs 0033, 0039).
- **Showing both, "EXIOBASE via Heartland's list".** Kilde is one column in a table and in the
  factor search; the reference already carries the path.

## Consequences

- Kilde now reads EXIOBASE, BEIS, DESNZ, Energinet or Kredsløb on the 49 rows, in the factor
  search, on Faktorer and anywhere else the factor's source is shown.
- No value changes. Only what the app says about where a value came from.
- The two originators the file itself does not name precisely — which Energinet document the
  200 %-method figures come from, and which Kredsløb declaration and year the district heating
  figure comes from — are named at the level ADR 0039 supports and no further. Line confirms them
  against the originals before the account is locked.
