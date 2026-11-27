# 42. Local-currency revenue at the ECB rate, and documents up to 128 MB

- **Status:** Accepted
- **Date:** 2026-11-27
- **Decided by:** @mortengad (tech lead), 2026-11-27, on two reports from Line, Heartland's ESG owner.

## Context

Line reported two problems on category 15:

- **Revenue in local currency counted as nothing.** A holding had its revenue in CNY and the
  currency chosen, but *Kurs (DKK pr. enhed)* was blank. The revenue was multiplied by a blank
  rate, so it came to 0 EUR, and the holding waited with "Omsætning mangler". The app already
  has the ECB's daily CNY rates (ADR 0016) and uses them for the EUR conversion (ADR 0028), but
  not for the local currency.
- **A 44 MB ESG report couldn't be saved.** Documents (ADRs 0029 and 0035) are file columns,
  created with Dataverse's default limit of 32 MB.

## Decision

1. **Local currency.** When the revenue is in a local currency and no rate is entered, it's
   converted at the ECB reference rate for that currency on the holding's date, or the last one
   up to 7 days before (ADR 0016). An entered rate still wins. A currency with neither an ECB nor
   a fixed rate waits with "Kurs for XYZ mangler" instead of counting as zero. The holding's
   summary shows the rate used and where it's from, as it does for the EUR rate.
2. **Currencies.** The currency list offers the fixed currencies and every currency with ECB rates
   (GBP, NOK and USD are added).
3. **Documents up to 128 MB.** The file columns' maximum is raised to 128 MB, the most Dataverse
   accepts in one upload request. `dataverse:apply` raises the limit on an existing file column
   when it's below the schema's, and never lowers it. The maker portal can't change the limit; the
   Web API can.

### Rejected

- **Making the rate field required.** The ECB rate is the one the rest of the app uses, and the
  user would have to look it up by hand.
- **More than 128 MB.** Dataverse allows up to 10 GB, but only in chunked uploads, which the Power
  Apps client's upload doesn't do. A report over 128 MB can be compressed or linked to.

## Consequences

- Holdings with local revenue and no rate start counting once the page recalculates. Nothing has
  to be re-entered.
- `npm run dataverse:apply` must be run against each environment to raise the file limit. Until
  then, a file over 32 MB is refused by Dataverse with its own error message.
- Bigger files use more of the environment's file capacity, which is the cheapest capacity
  Dataverse has.
