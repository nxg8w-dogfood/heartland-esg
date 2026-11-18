# 28. Category 15 converts to EUR at the ECB rate on the holding's date, and shows it

- **Status:** Accepted
- **Date:** 2026-11-18
- **Decided by:** @mortengad (tech lead), 2026-11-18: the rate "must be in the reference
  description", and it's the ECB rate on the holding's date.

## Context

A holding on revenue or on the amount invested is converted from DKK to EUR, because the
EXIOBASE sector factors are per EUR. Category 15 used a fixed 7.4604 DKK per EUR, copied from
the original app. Spend lines have used the ECB's daily reference rates since ADR 0016, which
left category 15 out while it was being reworked. The fixed rate had no source to cite, and
nothing on the holding said which rate had been used.

The krone is pegged to the euro, so the choice of rate moves the result by well under 1 %. What
matters is that it can be documented.

## Decision

1. **The rate is the ECB's euro reference rate for DKK on the holding's date**
   (`dkkRate` in `src/calc/exchangeRates.ts`, the same table as spend). On a weekend or
   holiday it's the last rate before, at most 7 days back. Heartland's holdings are dated 31 July.
2. **After the table's last day, the fixed 7.4604 is used,** as for spend lines, and the holding
   says so.
3. **Each holding shows the rate it used and where it's from**, next to the amount in EUR:
   *Kurs 7,4752 DKK pr. EUR (ECB-referencekurs 31.07.2026)*. The category's description says
   amounts are converted at the ECB rate on the holding's date.
4. **Revenue typed in a local currency is unchanged:** it's converted to DKK at the rate typed
   on the holding, then to EUR as above.

## Options considered

- **The average ECB rate over the holding's 12 months (rejected 2026-11-18).** It's the usual
  rate for a year's revenue, but the investment amount is a balance on the holding's date, and
  one rate for both is simpler to document.
- **Keep the fixed rate and only show it (rejected).** It has no source beyond the original app.

## Consequences

- Category 15 figures change slightly: 31.07.2026's rate is 7.4752, so amounts in EUR fall by
  0.2 % against the fixed rate.
- A holding dated after the table's last day uses the fixed rate until the weekly update
  (README, *Update the exchange rates*) brings in the rate for its date.
