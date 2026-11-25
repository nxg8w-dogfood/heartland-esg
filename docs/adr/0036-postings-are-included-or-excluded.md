# 36. A ledger posting is included or excluded, nothing in between

- **Status:** Accepted
- **Date:** 2026-11-25
- **Decided by:** @mortengad (tech lead), 2026-11-25, on Heartland's request (Line, ESG)
- **Amends:** ADR 0015 (handlings and the estimate basis), ADR 0018 decision 1 (the handlings a change can set)

## Context

The ESG owner's posting rules had four handlings: *Udelad*, *Medtag*, *Medtag – review* and
*Afventer*. A posting under a review rule counted but was flagged; one under a pending rule was
shown and didn't count. An included account whose basis was *Skøn – bekræft* also put its
postings up for review. Heartland asked for Kontoplan to have only *Medtag* and *Udelad*: the two
in-between states read as undecided, and nobody worked through them.

When this was decided, 5 approved posting rules were *Medtag – review* (R19–R21, R24, R46) and 19
were *Afventer* (R25–R43), including R26 «Køb af anlægsaktiv», about 198 million DKK.

## Decision

1. **Two handlings: include and exclude.** `PostingHandling` and `PostingStatus` lose *review* and
   *pending*. An account rule's basis (*Skøn – bekræft* included) is still shown, but no longer
   changes a posting's status. *Utagget* stays: it isn't a handling, it means the account has no
   rule at all.
2. **Review becomes include, pending becomes exclude.** This keeps every total as it was: review
   postings already counted, pending ones didn't. The rules keep their reasons, which still say
   what was to be checked, and anyone can change a rule to *Medtag* for their company (ADR 0018).
3. **The mapping is applied wherever a handling is read** (`toHandling` in
   `src/calc/spendRules.ts`): the ESG owner's CSV when the rule file is regenerated, changes saved
   in Dataverse or a draft before this. The Dataverse choice column keeps its two retired options
   so that older rows still read; the app only writes *Udelad* and *Medtag*.
4. `src/data/scope3Rules.ts` was updated with the same mapping the generator now applies, since
   the CSV files aren't committed (ADR 0015).

## Options rejected

- **Both become include.** The 19 pending rules would start counting at once, the asset purchase
  among them, without anyone deciding them.
- **Ask rule by rule first.** Right in principle, but it would hold back the change Heartland asked
  for. The mapping changes no total, and each rule can still be changed in the app.
- **Remove the retired options from the Dataverse choice column.** Rows that already use them
  would fail to read.

## Consequences

- The tiles *Til review* and *Afventer* are gone from Kontoplan and the category pages.
- A line whose factor has no value still waits for one (*Afventer faktor*). That is about the
  factor, not the posting's handling, and is unchanged.
