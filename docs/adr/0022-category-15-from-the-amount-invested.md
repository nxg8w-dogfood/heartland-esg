# 22. Category 15 is estimated from the amount invested, as the data manual says

- **Status:** Accepted
- **Date:** 2026-11-17
- **Decided by:** @mortengad (tech lead), 2026-11-17, after comparing the app with Heartland's
  data collection manual (*Data collection manuals CSRD Pilot*, pages 40–41).

## Context

The original app estimates a holding without a climate account from the investee's revenue:
revenue in EUR × a factor per EUR × the ownership share. It also offers a third basis,
*Investment*, but never calculates it. ADR 0017 (decision 8) kept it that way: the import shows
the Investment Amount, but nothing is calculated from it.

The data collection manual describes category 15 differently. A company that reports its own
emissions counts as (scope 1 + 2 + 3) × the ownership share, as the app's CO2e basis already
does. For a company without a climate account it gives:

```
tCO2e = investment in company (DKK) × emission factor for the specific sector (kg CO2e/DKK) ÷ 1,000
```

The factors are *"industry-average emissions factors for investments in specific sectors"*.
The manual names no database or list.

## Decision

1. **The *Investment* basis is calculated:** the amount invested, converted from DKK to EUR at
   the app's rate, × a factor per EUR. The ownership share isn't applied again, because the amount
   already is the group's own stake. The ≤ 50 % rule still decides whether the holding counts
   (ADR 0006, ADR 0017).
2. **The factor is chosen as for revenue.** It's either a spend factor per EUR from the factor table
   or the holding's own value. EXIOBASE's sector factors are the industry averages the manual asks
   for. The manual's factor is per DKK; converting the amount to EUR and using a factor per EUR
   gives the same result.
3. **A negative amount doesn't count.** A written-down holding can have a negative book value,
   which would give negative emissions. The holding waits, and says why.
4. **The import stores the Investment Amount** in a new column, `hlesg_investering.hlesg_investeringdkk`.
   A new holding with a positive amount gets the *Investment* basis; otherwise it gets *Revenue*,
   as before. An update fills in the amount, but leaves the basis that the user chose alone.
5. **Revenue stays as a basis**, labelled as the original's estimate, so holdings that only have
   revenue can still be estimated.

## Options considered

- **Keep revenue as the only estimate (rejected).** It follows the original app, but not the manual
  that the numbers are reported against.
- **Replace revenue with the amount (rejected).** In the first real export, most holdings at or
  under 50 % have a revenue figure but no investment amount that matches their name. Dropping
  revenue would leave them with no estimate.
- **Apply the ownership share to the amount as well (rejected).** The amount invested is already
  the group's share. Multiplying again would count only a fraction of it.

## Consequences

- The category 15 total changes for holdings on the *Investment* basis. Before, they counted 0
  and waited.
- In the first export, the Investment Amount sheet uses another name dimension
  (*Organization Held Original*) than the ownership and revenue sheets (*FriendlyName*). Only a
  few holdings match by name, so most still get the revenue basis until the export is keyed by
  OrganizationID.
- `hlesg_investeringdkk` has to be applied to each environment (ADR 0007) before this ships
  there. The deploy stops if it's missing (ADR 0020).
- The fiscal-year question (the manual reports 1 August – 31 July, while the app counted a
  holding for the calendar year it's dated in) is decided in ADR 0023.
