# 16. Spend is converted at the exchange rate on the transaction date

- **Status:** Accepted
- **Date:** 2026-11-12
- **Decided by:** @mortengad (tech lead), 2026-11-12
- **Asked for by:** the ESG owner, 2026-11-12: amounts are converted at the rate on the day of
  the transaction.

## Context

Spend lines are converted from their currency to DKK, and from DKK to the factor's currency
(EUR for EXIOBASE, GBP for the BEIS rent factor on account 220001). The app had one fixed rate
per currency, copied from the original app, and none for GBP, USD or NOK: an unknown currency
was silently taken as DKK.

A code app's Content Security Policy blocks calls to other hosts until an environment admin
allows them (ADR 0011), and the rates aren't stored in Dataverse.

## Decision

1. **Spend lines use the rate on their date** (`dkkRate` in `src/calc/exchangeRates.ts`): the
   date's rate, or on a weekend or holiday the last rate before it, at most 7 days back. A line
   that spans a period uses the rate on its start date. This applies to every spend line, in
   categories 1, 2, 4 and 6.
2. **The rates are the ECB's daily euro reference rates** for DKK, GBP, SEK, NOK, USD and CNY.
   Danmarks Nationalbanken derives its DKK rates from the same fixing. A rate to DKK is the
   DKK-per-euro rate divided by the currency's rate per euro.
3. **The rates are committed as a generated table** (`src/data/exchangeRates.ts`, from 2024),
   made by `scripts/exchange-rates.ts`, like the ESG owner's rules (ADR 0015). The app doesn't
   call the ECB, so no CSP change or connector is needed, and each update is reviewed.
4. **No guessing when there's no rate.** After the table's last day, a currency with a fixed
   rate (EUR, SEK, ISK, CNY) falls back to it and the line says so. Any other currency leaves
   the line pending, with a warning, rather than being taken as DKK.
5. Category 15 (investments) still uses the fixed rates; it isn't spend-based and is being
   reworked separately.

## Options considered

- **Fetch rates from the ECB or Nationalbanken at runtime (rejected for now).** It's always
  current, but needs the host allowed in every environment's CSP, and somewhere to keep the
  rates so a report doesn't change when a request fails.
- **Store rates in Dataverse (not chosen).** It needs a new table and a regenerated data source,
  and still needs something to fill it.
- **Monthly average rates (rejected).** The ESG owner asked for the transaction date.

## Consequences

- Converted amounts move slightly from the old fixed rates. EUR is pegged, so EXIOBASE lines
  move by well under 1 %.
- The table must be regenerated (at least monthly, and before a period is closed); until then
  recent GBP, USD and NOK lines stay pending. Since 2026-11-12 the `exchange-rates` workflow
  does it every Monday and opens the update as a pull request, which a person reviews and
  merges. Pull requests opened with the workflow's own token don't start CI, so it starts CI
  on the branch itself; the repository has to allow GitHub Actions to create pull requests.
- The table adds about 50 kB of source (2024 to now, six currencies).
