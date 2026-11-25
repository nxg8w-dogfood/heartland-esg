# 38. A holding can be left out with a reason, and marked complete

- **Status:** Accepted
- **Date:** 2026-11-25
- **Decided by:** @mortengad (tech lead), 2026-11-25, on Heartland's request (Line, ESG)

## Context

Every holding in category 15 counted if its ownership share was 50 % or less and it fell in the
period. There was no way to leave a holding out on purpose and say why, short of deleting it,
which loses the record that it was considered. There was also no way to tell a holding whose
figures had been checked from one nobody had looked at.

A holding on revenue with no revenue counted as zero without a warning (the original app's
behaviour). Landfolk, set to revenue with none entered, looked finished when nothing had been
calculated.

## Decision

1. **Medtages ikke, with a reason.** A holding can be marked *Medtages ikke*. It then counts
   nothing and isn't reported as missing data. A reason is asked for, and the folded line shows
   it. Stored in `hlesg_medtagesikke` and `hlesg_begrundelse` on `hlesg_investering`.
2. **Færdig per holding.** A holding that counts (50 % or less, in the period) or is left out on
   purpose can be marked *Færdig*. That is possible only when nothing it needs is missing. A
   holding marked complete that later loses data shows that it is no longer complete. The folded
   line shows *Færdig* or *Ikke færdig*, and the section says how many are complete. Stored in
   `hlesg_faerdig`.
3. **No revenue is missing data.** A holding on revenue with no revenue (blank or zero) is pending
   (*Omsætning mangler*) instead of counting as zero.
4. *Færdig* records a person's judgement and changes no figure. It is not a lock: the holding
   can still be edited.

## Options rejected

- **One complete mark for the whole category.** It can't say which holdings are still open, and
  the import brings in dozens at once.
- **Delete holdings that don't count.** That loses the record that the holding was considered and
  why it was left out.
- **Lock a complete holding.** Heartland asked for a marker, not a workflow. A lock needs rules
  for who may unlock, which nobody has asked for.

## Consequences

- The three columns must be applied to each environment (`npm run dataverse:apply`) before a
  deploy, or the deploy stops on the schema check (ADR 0020).
- Holdings on revenue with zero revenue now show as missing data and stop counting toward the
  total, which they did before only as zero.
