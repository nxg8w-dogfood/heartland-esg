# 12. The electricity factor follows the location's municipality (DK1/DK2)

- **Status:** Accepted
- **Date:** 2026-11-10
- **Decided by:** @mortengad (tech lead), 2026-11-10: each location gets a municipality, which
  maps to price area DK1 or DK2 and so picks the location-based electricity factor. Locations can
  be created from fetched meters. Accepted 2026-11-11.

## Context

Until now every Scope 2 location used one national grid factor (`el-dk-location`). Heartland
asked for the factor to depend on where the site is. Energinet doesn't publish a factor per
municipality. It publishes one per **price area**:

- **DK1**, Vestdanmark: Jylland and Fyn, with their islands.
- **DK2**, Østdanmark: Sjælland, Lolland-Falster, Møn, Bornholm and the other eastern islands.

The two areas differ a lot. In 2025, DK1 was 68 g CO2e/kWh and DK2 was 43 g. Every municipality
lies wholly in one area, so the municipality decides the area. Region Hovedstaden and Region
Sjælland are DK2, and the other three regions are DK1.

Eloverblik's metering-point master data includes the DataHub `municipalityCode` (ADR 0011), so
for fetched electricity the municipality is usually already known. Varmeoverblik gives none.

## Decision

1. **A location has a municipality**, picked from Statistics Denmark's 98 municipalities
   (`src/data/municipalities.ts`, codes as in FOLK1A). It's saved in a new Dataverse column,
   `kommunekode`. Each municipality has its price area.
2. **The municipality picks the grid family.** DK1 is `el-dk1-location` and DK2 is
   `el-dk2-location`. With no municipality, the national `el-dk-location` is used, as before,
   and the screen says so. If the area series has no factor for a line's date, the national
   factor is used for that line.
3. **Factor values:**
   - **2022–2025: Energinet's actuals.** These come from the *Miljødeklaration* per price area,
     using the 125 % method, and they are location-based. This is the same source as the
     national series.
   - **2026–2035: Energistyrelsen's projection** in *El-emissionsfaktoren (2025-2035)*.
   - Energistyrelsen's figures for 2025 onwards are also offered as an alternative publication.
     Its 2024–2025 projections differ from Energinet's actuals (DK2 2024: 66 against 44 g), so
     actuals are the default wherever they exist.
4. **Meters can become locations.** After a fetch, each meter's location list has *Opret ny
   lokation: <address>*.
   - Meters at the same address share one new location, named after the address.
   - The new location gets the municipality from Eloverblik.
   - A heating meter borrows the municipality from an electricity meter at the same address.
   - A later fetch matches meters to the location by its name.
   - The fetch table shows each meter's municipality and price area.

## Consequences

- Existing locations keep the national factor until someone picks a municipality. Their
  numbers don't change on upgrade.
- Choosing a municipality changes past years' location-based totals for that location. This is
  intended, because the area factor is the more accurate one. The factor shown on each line
  names the area series.
- The market-based method is unchanged. The residual mix is national, and contractual
  instruments don't depend on the area.
- Projections for 2026 onwards are replaced by actuals when Energinet publishes them. This is a
  data change in `src/data/factors.ts`.
- A municipality code from DataHub that isn't one of the 98 is ignored, and so is one in
  saved data. The location then falls back to the national factor.

## Rejected options

- **A factor per municipality.** No such data is published. The grid is balanced per price area.
- **Infer the area from the postcode.** Postcodes don't follow the area boundary as cleanly as
  municipalities do, and DataHub already gives the municipality.
- **Let the user pick DK1/DK2 directly.** It's simpler, but people know their municipality, not
  their price area. The municipality is also useful for reporting.

## Sources

- Energinet, *Miljødeklaration – årsgennemsnit*:
  https://www.energinet.dk/media/4ffc1azq/miljoedeklaration-aarsgennemsnit-260519pub.xlsx
- Energistyrelsen, *El-emissionsfaktoren (2025-2035)*: https://ens.dk/media/7359/download
- Statistics Denmark, FOLK1A municipality list: https://api.statbank.dk/v1/tableinfo/FOLK1A
