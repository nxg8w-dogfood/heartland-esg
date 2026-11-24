# 34. Index regulation is applied to the factor, not the amount

- **Status:** Accepted. Refines how ADR 0030 shows the regulation; the result is unchanged.
- **Date:** 2026-11-24
- **Decided by:** @mortengad (tech lead), 2026-11-24: "Indexregulation should be on factors -
  not the economy - and it should alone be shown under factors for the selected period. On the
  scope 3 page it should just show the indexregulated factor."

## Context

ADR 0030 regulated spend lines by bringing the amount to the factor's price year:

> amount ÷ (index for the line's year ÷ index for the base year) × factor

Scope 3 then showed each amount twice, as booked and "in 2021 prices", next to the unregulated
factor. That mixes the regulation into the accounting figures, and the factor shown on a line
wasn't the one the line's emissions were calculated with.

## Decision

1. **The factor is regulated, the amount is left as booked.**
   `regulated factor = factor ÷ (index for the line's year ÷ index for the base year)`
   (`regulateFactor` in `src/calc/spend.ts`). Amount × regulated factor is the same number as the
   regulated amount × factor, so no figure changes.
2. **Faktorer → Indeksregulering lists the regulated factors for the selected period**: every
   spend factor with a value, its base year, and its value regulated to each year the period
   touches. A factor that can't be regulated says so.
3. **Scope 3 shows only the regulated factor** on spend lines (categories 1 and 4 courier) and
   category 15 holdings, marked "Indeksreguleret til <year>" with a link to the page above. The
   "in base-year prices" amount is gone.

## Options rejected

- **Keep regulating the amount and only move the explanation.** The factor shown on a line would
  still not be the one used.
- **Store regulated factors per year.** They follow from the series and the base year, so storing
  them would only add something that can go stale.

## Consequences

- `SpendResult.deflatedAmount` and `InvestmentResult.deflatedEUR` are replaced by
  `regulatedFactorValue` and `regulatedKgPerEUR`.
- As before, a line's own factor is regulated like the table factor, and a holding's own factor
  isn't (ADR 0030).
