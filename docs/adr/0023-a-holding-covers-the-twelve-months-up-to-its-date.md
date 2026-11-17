# 23. A category 15 holding covers the 12 months up to its date

- **Status:** Accepted
- **Date:** 2026-11-17
- **Decided by:** @mortengad (tech lead), 2026-11-17: "Fiscal year is something we need to add".

## Context

Heartland reports for the fiscal year 1 August – 31 July, and the data collection manual
(*Data collection manuals CSRD Pilot*, pages 40–41) identifies investments at 31 July. The group
export dates each holding on the last day of the chosen period, so a July 2026 import is dated
31.07.2026.

Until now a holding stood for the calendar year it was dated in. A holding dated 31.07.2026 was
counted for 2026, so only 212 of its 365 days fell in the fiscal year 2025/26, and 153 days went
to a fiscal year it doesn't describe. The import also treated two holdings dated in the same
calendar year as the same holding, so 31.07.2026 and 31.12.2026 would overwrite each other.

## Decision

1. **A holding covers the 12 months up to and including its date.** 31.07.2026 covers
   01.08.2025–31.07.2026, Heartland's fiscal year. 31.12.2025 covers the calendar year 2025, so
   holdings typed in by hand at year end count as before.
2. **It counts for the share of those days that falls in the period**, as consumption lines do
   (ADR 0013). A holding that covers the whole period counts in full; one that covers part of it
   counts for that part.
3. **The import updates the holding for the same company on the same date.** Another date is a
   new row. This replaces ADR 0017's decision 5 (the same calendar year).
4. **Two holdings for the same company with overlapping months are flagged** as counted twice.
   Consecutive fiscal years don't overlap and aren't flagged.
5. **A YTD export is flagged unless the period is July**, the last month of the fiscal year,
   because only then is the year-to-date figure a full 12 months.

No column changes: the existing date is read differently.

## Options considered

- **A fiscal year per holding (rejected).** A start month on each holding, or on the group,
  says the same thing as the date with one more field to fill in and keep in step.
- **Use the company's fiscal periods from ADR 0013 (not chosen now).** The holding belongs to the
  group, not to one company's account, and the group export already gives the date. Worth
  revisiting if holdings move onto the companies that own them.
- **Keep the calendar year (rejected).** It splits every 31 July holding across two fiscal years,
  which doesn't match the manual or the export.

## Consequences

- Holdings dated 31.07 move from calendar-year counting to the fiscal year they describe. On dev,
  all 67 imported holdings are dated 31.07.2025 and now count in full for 2024/25.
- A period that doesn't line up with the holding's 12 months shows the share that does, e.g.
  58,1 % of a 31.07.2026 holding in the calendar year 2026.
- The status line says which 12 months a holding covers: `2025` for a calendar year, `2025/26`
  across a year end.
