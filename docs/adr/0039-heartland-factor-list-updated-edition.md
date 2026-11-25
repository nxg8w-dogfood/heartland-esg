# 39. The updated edition of Heartland's factor list

- **Status:** Accepted
- **Date:** 2026-11-25
- **Decided by:** @mortengad (tech lead), 2026-11-25: "I recieved a file with updated
  emissionfactors from line - can you update them in the platform", with a new
  *HEARTLAND Emissionsfaktorer 2025-26.xlsx* attached.

## Context

ADR 0033 made Heartland's factor list a selectable publication with 25 EXIOBASE factors. The
new edition has 48 rows and a *Parametre* sheet:

- 22 more EXIOBASE factors. The app already had all of them, without a value.
- The BEIS rent factor, with the same value as the built-in one.
- Petrol (100 % mineral), DESNZ 2025.
- Electricity by the 200 % method for DK1 and for Aarhus Municipality, 2025.
- The general electricity declaration (market-based) 2025, the same as the built-in residual mix.
- District heating in Aarhus from Kredsløb, in kg CO2e per MWh.
- Grid loss and the WTT ratio for Scope 3.3, the same as the built-in values.
- Exchange rates for EUR and GBP, and a price adjustment of 1.00.

## Decision

- **Publication:** the publication gets every row except two kinds:
  - *EXIO-APP*. It is "Wearing apparel/furs, China", with the same value as *EXIO-APP-CN*. It is
    not used for the Danish apparel factor, which would have needed a Danish value.
  - The exchange rates and the price adjustment.
- **Factors:** four factors are added, blank until the list is chosen, as in ADR 0033:
  - `f-s1-benzin-mineral`;
  - `f-s2-el-dk1-200-2025`;
  - `f-s2-el-aarhus-200-2025`;
  - `f-s2-fjernvarme-aarhus-2025`. The list gives this one per MWh, and the app stores it as
    0.0086 kg CO2e per kWh so it fits district heating lines.
- **Electricity:** the automatic electricity factor per price area and municipality (ADRs 0012
  and 0031) stays on the 125 % method. The 200 % factors are chosen on a line.
- **Uncertain rows:** the list marks the country of three rows "tjek land". They are taken as
  given, and the publication's note says so.

### Rejected

- **Writing the values into the built-in table.** Rejected for the same reason as in ADR 0033.
- **Replacing the automatic DK1 factor with the 200 % value.** DK2 and the other municipalities
  have no 200 % value. Changing only DK1 would mix two methods in one inventory.
- **Using the list's exchange rates and price adjustment.** Amounts are converted at the ECB
  rate on the posting's date (ADR 0028) and index-regulated to 2021 (ADRs 0030, 0034). Line
  asked for that regulation on 2026-11-25.

## Consequences

- *Brug for alle* on the list fills 49 factors on Faktorer. This includes the 16 EXIOBASE
  factors that were still blank.
- Nothing changes until someone chooses the list.
