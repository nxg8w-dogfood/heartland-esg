# 40. Category 15: legal names, last year's factor and emissions, and an overview

- **Status:** Accepted
- **Date:** 2026-11-26
- **Decided by:** @mortengad (tech lead), 2026-11-26, passing on feedback from Line, Heartland's
  ESG owner.

## Context

Line gave three pieces of feedback on category 15:

- **Names.** Holdings are named by the cube's FriendlyName (ADR 0025, point 4). She wants the
  OrganizationName, and the OrganizationID kept. Holdings she has marked complete must not be
  corrected, only renamed.
- **Next year.** When next year's or next quarter's figures are imported, each holding should
  keep the emission factor used the year before. She also wants to see what each holding
  emitted last year, compactly, for example on hover.
- **Overview.** She wants an overview of which holdings emit most, and to search for a holding
  and sort by largest or smallest.

## Decision

1. **Names.** The holding is named by the OrganizationName. When it's blank, the FriendlyName is
   used, then the OrganizationID. This replaces ADR 0025, point 4. The FriendlyName is kept on the
   imported row, so a holding saved under it before an OrganizationID existed is still found.
2. **Renaming.** An import renames every holding with the same OrganizationID, whatever its
   date. That is the only change it makes to holdings on other dates.
3. **Complete holdings.** On the import's date, a holding marked complete is only renamed. Its
   figures, factor and source are left as they are. The preview says "Færdig — kun navnet
   opdateres" and shows the old name.
4. **Last year's factor.** A holding without a factor takes the factor of the same company's
   latest earlier holding. That is a factor-table factor, or the holding's own value. The same
   company means the same OrganizationID, or the same name when either holding has no ID. Only
   when no earlier holding has a factor does the holding get its business area's factor (ADR
   0026). The preview says "som sidste år".
5. **Last year's emissions.** Each holding's folded line shows "Sidste år: x t". That is what the
   same company's previous holding came to for its own 12 months. Hovering shows the months,
   the ownership and the factor. The same text is there for screen readers, which don't read a
   tooltip.
6. **Overview.** *Største udledere* lists the 10 holdings that emit most in the period. It shows
   each one's tCO2e, its share of category 15 and a bar.
7. **Search and sort.** Above the holdings is a search on name and OrganizationID, and a sort:
   as imported, largest first, smallest first, or by name.

### Rejected

- **Showing last year only on hover.** A tooltip can't be reached by keyboard or touch. Instead
  the value is shown in a few words on the line, and the details on hover.
- **Last year for every scope now.** Line asked for it "for alle scopes". Scope 1–3 lines aren't
  linked from year to year the way holdings are by OrganizationID, so it needs its own design.
  This ADR covers category 15 only.

## Consequences

- To see the new names on holdings already imported, re-import the July 2026 table. Complete
  holdings only change their name.
- A holding whose factor was chosen last year doesn't have to be chosen again.
