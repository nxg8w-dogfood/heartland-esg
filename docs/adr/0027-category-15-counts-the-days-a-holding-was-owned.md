# 27. A category 15 holding bought or sold during the year counts for the days it was owned

- **Status:** Accepted
- **Date:** 2026-11-18
- **Decided by:** @mortengad (tech lead), 2026-11-18: "If the company is bought or sold during a
  year - the option of a start or end date should be there".

## Context

A holding covers the 12 months up to its date (ADR 0023) and counts for the part of them in the
period. Its figures are for the whole year: the investee's revenue, emissions or the amount
invested. A company the group bought in February, or sold in October, was only the group's for
part of those months, but counted for all of them.

The company table from the cube (ADR 0025) has no acquisition or sale date, so the import can't
tell.

## Decision

1. **A holding has two optional dates, *Ejet fra* and *Ejet til*:** the first and last day the
   group owned the company, when that falls within the 12 months. Both are empty for a company
   owned all year, which is every holding until someone fills them in.
2. **Only the days owned count.** The share in the period is the owned days that fall in the
   period over the days in the 12 months. A company bought on 1 February and dated 31 July
   counts for 181 of 365 days. The year's figure is not scaled up or down otherwise: it is taken
   to be spread evenly over the year.
3. **Dates outside the 12 months are ignored.** A company bought before the 12 months began
   counts from their start. If the dates leave no day of the 12 months (from after to, or both on
   one side), the holding counts as nothing, and the card says why.
4. **Two holdings of one company are flagged only if the days owned overlap.** A company sold and
   bought back in the same year is two holdings that don't count twice.
5. **The dates are stored in `hlesg_investering.hlesg_ejetfra` and `hlesg_ejettil`,** date-only
   columns. A re-import keeps them, as it keeps a chosen factor.

## Options considered

- **Ownership percentage over time (rejected for now).** A stake that grows from 20 % to 40 %
  mid-year would need a percentage per date. The cube gives one percentage per month-end, and
  no holding has asked for it yet. Two holdings with owned dates can express it.
- **Scale by whole months (rejected).** The rest of the app counts in days (ADR 0023), and a
  month count would round a purchase on the 20th to the whole month.
- **Read the dates from the cube (not possible now).** The company table has no such columns. If
  a later export does, the import can fill them in.

## Consequences

- The two columns have to be applied to each environment (ADR 0007) before this ships there;
  the deploy stops if they're missing (ADR 0020). Dev has them from 2026-11-18.
- The ESG owner has to enter the dates by hand for companies bought or sold during the year.
- Revenue, emissions and the amount invested are still the whole year's. If an investee reports
  only the months after it was bought, the dates must be left empty, or the months count twice
  in the other direction.
