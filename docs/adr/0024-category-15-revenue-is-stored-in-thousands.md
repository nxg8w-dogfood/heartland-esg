# 24. Category 15 revenue is stored in thousands

- **Status:** Accepted
- **Date:** 2026-11-18
- **Decided by:** @mortengad (tech lead), 2026-11-18, after the July 2026 import failed on Zalando.

## Context

A holding's revenue is the investee's whole revenue, which for a listed company can be larger
than Dataverse can hold. Every decimal column in the schema goes from −100 bn to 100 bn
(`decimal()` in `src/dataverse/schema.ts`). Zalando's revenue for August 2025 – July 2026 is
100,937,926,370 DKK in the group export, which agrees with its annual report (€12.3 bn for 2025,
with About You consolidated from July 2025). Dataverse refused to create the holding
(`DecimalValueOutOfRange`), and the rest of the import had already been saved without it.

Revenue in local currency has the same problem sooner: a large company's revenue in yen or
Swedish kronor passes 100 bn long before it does in DKK.

## Decision

1. **Both revenue columns are stored in thousands:** `hlesg_omsaetningtdkk` and
   `hlesg_omsaetningtlokal`, decimals like the rest. They hold up to 100,000 bn (10¹⁴), rounded
   to 0.001 of a unit. The app still works in units; only the storage changes.
2. **The unit columns stay, for reading only.** A holding saved before has its revenue in
   `hlesg_omsaetningdkk` / `hlesg_omsaetninglokal`, and is read from there while the new column
   is empty. The next save writes the new column and empties the old one.
3. **A value read back saves unchanged.** The conversion rounds to whole thousandths in both
   directions, so loading and saving doesn't send updates no one made (ADR 0005).

## Options considered

- **Money column (rejected).** It holds up to 922,337 bn. But Dataverse ties every money value
  to a transaction currency and stores a base-currency copy. The app keeps its own currency
  and rate per holding, so this would be a second currency setup to keep in step.
- **Whole number (BigInt) column (rejected).** It holds far more, but drops decimals. Revenue in
  local currency is typed in by hand and can have them.
- **Floating-point column (rejected).** It has the same ±100 bn limit as decimal.
- **Store revenue in EUR (rejected).** It moves the limit by a factor of 7.5, not enough for
  local currencies. It would also make storage depend on the exchange rate.

## Consequences

- The two columns have to be applied to each environment (ADR 0007) before this ships there;
  the deploy stops if they're missing (ADR 0020). Dev has them from 2026-11-18.
- Holdings saved before are moved to the new columns, one update each, the next time the
  group is saved.
- Other decimal columns keep the 100 bn limit. None of them holds a whole company's figure in
  money: the investment amount is the group's own stake, and emissions are in kg.
