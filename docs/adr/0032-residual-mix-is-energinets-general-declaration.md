# 32. The residual mix is Energinet's general declaration, built in per year

- **Status:** Accepted
- **Date:** 2026-11-19
- **Decided by:** @mortengad (tech lead), 2026-11-19: "We need to take the market-based factors
  as well", with Energinet's *Generelle Eldeklaration 2025 (med revision)* attached.

## Context

A location on residual mix ("Residualmiks") has its market-based figure from the factor family
`el-dk-residual`. Until now every member was blank and had to be entered, because the value "must
not be guessed". The 2025 value could be chosen as a publication on the factors page.

Energinet's *Generelle Eldeklaration* is the market-based declaration under the GHG Protocol for
consumers who have not bought guarantees of origin. It is published once a year as an audited PDF,
around June the year after. No dataset on Energi Data Service holds it; the declaration datasets
there are all location-based.

| Year | g CO2e/kWh | Source |
|---|---|---|
| 2022 | 432 | Energinet, Generelle Eldeklaration 2022 (med revision), p. 4 |
| 2023 | 499 | Energinet, Generelle Eldeklaration 2023 (med revision), p. 3 |
| 2024 | 450 | go'energi's copy of the general declaration 2024 (Energinet's own report not found) |
| 2025 | 348.07 | Energinet, Generelle Eldeklaration 2025 (med revision), p. 3 |

## Decision

The residual-mix family gets one built-in factor per year from 2022 to 2025, with the value of the
row *Drivhusgasser (CO2 ækv.)*. The years before 2022 keep the old id `f-s2-el-residual` and stay
blank. 2026 stays blank until Energinet publishes it in 2027.

The 2025 publication stays selectable, so accounts that chose it keep a valid choice. It has the
same value as the built-in factor.

The 2024 value is taken from an electricity supplier's copy, because Energinet's own 2024 report
was not found. That copy's 2023 column (499) matches Energinet's 2023 report. When Energinet's
2024 PDF is found, the reference should point to it.

## Consequences

- Residual mix now has a market-based figure for 2022–2025 without anyone entering a value.
- A value entered manually for `f-s2-el-residual` used to cover lines up to 2024. It now covers
  lines up to 2021; 2022–2024 use the built-in values. A company that wants its own value for
  those years chooses it on that year's factor.
- Each June a developer adds the new year's value from Energinet's PDF.
