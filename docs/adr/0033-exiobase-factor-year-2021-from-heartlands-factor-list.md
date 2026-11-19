# 33. EXIOBASE factors have factor year 2021, from Heartland's factor list

- **Status:** Accepted
- **Date:** 2026-11-19
- **Decided by:** @mortengad (tech lead), 2026-11-19: "I received a new emission factor list with
  year for the factor - let's add the year to our current factors", with
  *HEARTLAND Emissionsfaktorer 2025-26.xlsx* attached.

## Context

ADR 0030 gave every EXIOBASE spend factor a price year of 2019, the base year for regulating
amounts with the Net Price Index. Heartland's own factor list for 2025/26 gives each factor a
year, and every EXIOBASE factor in it has the year 2021. Its parameter sheet says the same:
"EXIOBASE-faktorerne er fra 2021".

The list has 25 factors in kg CO2e per EUR. Nine match a built-in value exactly. Fifteen are
factors the app has without a value. One, *Other business services, Tyskland*, the app did not
have.

## Decision

- All 41 EXIOBASE factors get `priceYear: 2021`. Index regulation now brings amounts to 2021
  prices instead of 2019 prices.
- The factors page shows the factor year in its own column.
- The list becomes a selectable publication, *Heartland, Emissionsfaktorer i
  klimaregnskabsmodellen 2025/26*, with the list's factor ID as the row. Choosing it on a factor
  takes its value. Nothing changes until someone chooses it, as with the other publications. The
  list has no public address, so a publication's URL is now optional.
- *Other business services, Tyskland* (`f-exio-obs-de`) is added, blank until the list or
  another source is chosen.

### Rejected

- **Writing the list's values into the built-in table.** That would replace "awaiting a value"
  with the company's own figures without anyone choosing them on the factors page.

## Consequences

- With index regulation on, a 2025 amount is multiplied by 86.79/100 (2021) instead of
  85.23/100 (2019). Emissions on spend lines and category 15 rise by about 1.8 %.
- The list's other parameters (EUR and GBP rates, grid loss 7 %, WTT ratio 0.2419) are not
  taken over. The app already uses ECB rates and its own loss and WTT factors.
