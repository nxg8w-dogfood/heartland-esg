# 30. Spend factors are index-regulated with Danmarks Statistik's Net Price Index

- **Status:** Accepted. The price year 2019 is replaced by the factor year 2021 in ADR 0033.
- **Date:** 2026-11-19
- **Decided by:** @mortengad (tech lead), 2026-11-19: the EXIOBASE factors are from 2019 and must
  be regulated for each year "with the NPI from DKStat", the Net Price Index.

## Context

The EXIOBASE spend factors are kg CO2e per EUR in 2019 prices. A euro spent in 2025 buys less
than one in 2019, so multiplying 2025 amounts by 2019 factors overstates emissions by the price
rise. The app could already regulate amounts to a factor's price year, ported from the original:

> amount ÷ index for the line's year × index for the base year

That mechanism wasn't usable in practice:

- Its three series started empty, and every index value had to be typed in.
- Every factor's base year also had to be typed in.
- It covered only category 1 in the settings, and category 15 ignored it.

The "Producentprisindeks" series also named the wrong table, PRIS111, which is the consumer
price index.

## Decision

1. **The Net Price Index is the default series.** The values are the yearly averages from
   Danmarks Statistik's *Nettoprisindeks*, table PRIS05, currently based 2025 = 100. They come with
   the app in `src/data/netPriceIndex.ts`.
   - `npm run npi` fetches the table from the StatBank API and rewrites that file. Run it when
     a new yearly average is out (January) and open a PR.
   - The values are fetched, never typed in. If DST rebases the index, the whole series is
     replaced at once, so ratios stay consistent.
2. **EXIOBASE factors have a price year of 2019**, which is the new `priceYear` field on the
   factor. That is the base year unless an account sets another for the factor.
3. **A year without a published average uses the latest one**, which today is 2025 for 2026
   lines. The line says so. Once DST publishes that year's average, the line uses it.
4. **Values entered for a series take precedence** over the built-in ones, year by year, so an
   account can still use a different source for a year. The other series (PPI, GDP deflator)
   stay as they were: empty until values are entered.
5. **It applies to every spend factor in use:**
   - Spend lines in categories 1, 2, 4 (courier) and 6.
   - Category 15 holdings on revenue or amount invested that use a factor from the table. A
     holding's own factor has no known price year, so it isn't regulated.
6. **Regulation is switched on per account**, as before. Nothing changes until it's ticked
   under Scope 3 → Indstillinger.

## Consequences

- Once regulation is ticked, 2025 spend is multiplied by 85.23 / 100 = 0.85 before the factor is
  applied, which lowers spend-based emissions by about 15 %.
- Each line and holding shows its amount in 2019 prices and which index it used.
- When the 2026 average is out, figures for 2026 lines move slightly. That needs a data PR.
- The yearly refresh is a manual step. A missed refresh doesn't break anything: the latest
  year is used and the line says so.

## Rejected options

- **Fetch the index from the app at runtime.** The StatBank API allows CORS, but a code app's
  CSP blocks unknown hosts until an admin allows them (ADR 0011). A reproducible report
  also needs fixed values, not ones that change when DST revises.
- **The consumer price index (PRIS8/PRIS111) or the domestic supply index (PRIS1900).** The
  tech lead chose the Net Price Index.
- **Eurostat's HICP.** It would match the factors' currency, but the tech lead chose the
  Danish index.

## Sources

- Danmarks Statistik, PRIS05 Nettoprisindeks:
  https://api.statbank.dk/v1/data/PRIS05/CSV?lang=da&Tid=*&HOVED=1005
