# 31. The electricity factor is the municipality's own, from Energi Data Service

- **Status:** Accepted
- **Date:** 2026-11-19
- **Decided by:** @mortengad (tech lead), 2026-11-19: Scope 2 must "use the factor for the
  municipality", as in Energinet's *Miljødeklaration per kommune*. The figures should come from an
  API if one has them. Approved with "Go".

## Context

ADR 0012 gave each location a municipality, which picks its price area (DK1/DK2) and so its
grid factor. It rejected a factor per municipality, because no such data was known.

Energinet does publish one. The yearly spreadsheet *Miljødeklaration, årsgennemsnit* has a sheet,
*Miljødeklaration per kommune*, with 98 municipalities for 2015–2025, by the 125 % and 200 %
methods. Municipalities differ a lot within an area. In 2025 København was 48 g CO2e/kWh, Aarhus
75 g and the whole range 8–186 g, because renewables produced and used locally are taken out.

No dataset on Energi Data Service holds the yearly figure. It holds the hourly parts the figure is
made of. Energinet documents that the two combine into the declaration per municipality:

- **ReCoverageMunicipality:** each municipality's consumption, and the share (%) covered by local
  renewables.
- **DeclarationTransmissionEmission:** the CO2, CH4 and N2O per kWh of the rest, per price area
  and fuel allocation method.

Combining them hour by hour reproduces the spreadsheet: the consumption-weighted average of
(1 − local share) × (CO2 + CH4 × 28 + N2O × 265), using the 125 % method, the final version and
no grid-loss factors. For 2025, København comes out at 48.10 g (spreadsheet 48.10) and Aarhus at
74.77 g (74.79). The comparison for every municipality is under *Consequences*.

## Decision

1. **The figures come from Energi Data Service.** `npm run municipality-grid 2022 2023 2024 2025`
   computes them and writes `src/data/municipalityGrid.ts`. The script uses the 125 % method, as
   for the price areas (ADR 0012), and Danish calendar years. A year with missing hours gets no
   figure, so a gap never passes as a value. Run it when Energinet finalises a year, in spring,
   and open a PR.
2. **They're factors in the factor table:**
   - One family per municipality (`el-kommune-<code>-location`) and one factor per year
     (`f-s2-el-kommune-<code>-<year>`), from 2022, like the price areas. The values are
     rounded to 0.01 g.
   - Each can take another source on the factors page, like any factor.
   - The page folds them into one group, *Elmiks pr. kommune*.
3. **A location uses its municipality's factor, then its area's, then the national one**, for
   each line's year. 2026 has no municipality figure yet, so 2026 lines use the DK1/DK2
   projection. A bill spanning New Year is split by year, and each part uses the series for
   its own year.
4. **The app doesn't call the API at runtime.** A year needs about 860,000 hourly rows, the
   API limits requests hard (a five-minute wait is common), and a code app's CSP blocks the
   host until an admin allows it (ADR 0011). The figures are also fixed per year, so a report
   can be reproduced.

## Consequences

- The API figures agree with Energinet's spreadsheet (16.11.2026 edition) within 0.3 g for 386
  of 392 municipality-years, and on average within 0.01–0.04 g for 2024–2025. Six differ more.
  The likely cause is that the hourly data and the spreadsheet were made from different
  revisions:

  | Year | Municipality | API (g/kWh) | Spreadsheet (g/kWh) |
  |---|---|---|---|
  | 2022 | Samsø | 77.12 | 86.74 |
  | 2023 | Samsø | 31.86 | 65.10 |
  | 2022 | Hvidovre | 68.93 | 68.39 |
  | 2023 | Ringkøbing-Skjern | 28.58 | 29.23 |
  | 2024 | Ringkøbing-Skjern | 24.55 | 25.02 |
  | 2025 | Esbjerg | 56.87 | 55.06 |

  A company with sites in these municipalities can choose another source for that factor on
  the factors page, for example the spreadsheet's value with its reference.
- Locations with a municipality get new location-based figures for 2022–2025. Locations without
  one are unchanged.
- The factors page lists the municipality factors in their own group, opened on demand.
- Each year needs a data PR. If one is missed, the area figure is used and the line names it.
- Market-based figures are unchanged.

## Rejected options

- **Copy the spreadsheet.** It has the same numbers, but they'd be typed in or parsed from an
  Excel file whose layout changes. The API gives a repeatable script, which the tech lead
  asked for.
- **The 200 % method.** It is a different allocation of CHP fuel, and the area series uses
  125 %. Mixing them would make municipality and area figures incomparable.
- **Hourly factors per location.** That would need hourly consumption, which the app doesn't
  have (Eloverblik gives months).

## Sources

- Energinet, *Miljødeklaration, årsgennemsnit* (16.11.2026), sheet *Miljødeklaration per
  kommune*: https://www.energinet.dk/media/4ffc1azq/miljoedeklaration-aarsgennemsnit-261116pub-1.xlsx
- Energi Data Service, ReCoverageMunicipality:
  https://www.energidataservice.dk/tso-electricity/REcoverageMunicipality
- Energi Data Service, DeclarationTransmissionEmission:
  https://www.energidataservice.dk/tso-electricity/DeclarationTransmissionEmission
