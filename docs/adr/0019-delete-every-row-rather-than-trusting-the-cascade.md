# 19. Every row that goes is deleted, rather than trusting Dataverse's cascade

- **Status:** Accepted
- **Date:** 2026-11-13
- **Decided by:** @mortengad (tech lead), 2026-11-13
- **Supersedes:** ADR 0005 section 7's assumption that a parental delete is enough.

## Context

`hlesg_postering` hangs off `hlesg_import`, and most of a company's tables hang off
`hlesg_virksomhed`, through parental relationships. So `diff()` sent one delete for the parent
and skipped the children: Dataverse removes them through the cascade.

On 2026-11-13 that was tried at real scale for the first time. An import of 18,802 postings was
deleted in the app:

- The app sent one delete for the `hlesg_import` row. It returned success after 23 seconds, and
  the app reported *Gemt*.
- After a reload, the import was still there with **18,436** of its postings. Only 366 had gone.

That reading was taken as final, and it was not: the cascade was still running. See the
amendment below. What holds either way is that the app had already dropped the children from its
own copy, called the save a success, and showed the import as half-saved on the next load —
telling the user something was wrong while having no way to finish the job.

## Decision

1. **`diff()` emits a delete for every row that goes**, children before parents, in the reverse
   of the create order. The `cascades()` shortcut is gone.
2. **The existing save machinery does the rest.** Deletes of one table run a few at a time with
   the same concurrency, progress reporting and service-protection retry as creates and updates
   (ADR 0005, `SaveOptions`). A large delete now shows *Gemmer N af M ændringer* like a large
   import.
3. **A row that is already gone is not an error.** `isAlreadyGone()` treats 404, *Resource not
   found* and `0x80040217` on a delete as the outcome we wanted, because a cascade may have
   removed some children behind the app's back — as it had on the half-deleted import this
   decision came from.

## Options considered

- **Keep the cascade and verify afterwards (rejected).** It would mean reading the children back
  after every parental delete, which costs a query per delete and still leaves the app to clean
  up when the cascade fell short. Deleting them outright is simpler and has one failure mode.
- **Keep the cascade and retry the parent until its children are gone (rejected).** It relies on
  the cascade eventually finishing, which is what failed, and gives the user nothing to watch.
- **A bulk delete request (not chosen).** Dataverse can delete a set in one request, but the
  generated services this app uses expose one delete per record (ADR 0007), and bulk operations
  count against the same service protection limits. Worth revisiting only if the time becomes a
  problem.

## Consequences

- Deleting a large import now takes about as long as importing it — thousands of requests at
  roughly 50 a second — instead of one request that returns at once and leaves the work to a
  cascade the user can't see. The user sees the progress and is asked not to close the app, as on
  an import.
- Deleting a company sends a delete per row of that company, not one. That is slower and is the
  same correctness fix.
- A delete interrupted part-way leaves fewer rows each time and can simply be run again: what is
  already gone is skipped.
- The app no longer treats a 204 on a parent as proof its children are gone.

## Amendment, 2026-11-13: the cascade is slow, not broken

Later the same afternoon I re-checked the environment and found Blackbird Air empty: no import,
no postings, its Scope 3 down from 887,073 to 1,323 tCO2e, with nobody having deleted anything
in between. The import row and its 18,436 postings were still there at about 12:47 and gone by
about 14:50.

So the premise in *Context* above is wrong, and I got it wrong: **Dataverse's parental cascade
does finish — asynchronously, and slowly.** It took under two hours for 18,802 rows. The 366 I
measured was a snapshot of a cascade still draining, which I reported as a permanent half-delete.

The decision stands, for a narrower reason than first stated:

- The app reports *Gemt* while thousands of rows are still being removed server-side, so "saved"
  means "the request was accepted", not "the data is gone".
- For as long as the drain takes, the next load shows the import as half-saved, and the user has
  no way to tell whether their delete worked, is still working, or failed.
- Deleting every row explicitly makes the delete synchronous, observable while it runs, and
  actually finished when the app says it is.

What this costs is still what *Consequences* says: a large delete now takes about as long as the
import did, instead of one request that appears instant and is not.

Not yet proven at real scale: the batched delete has only been exercised against the fake
Dataverse in the tests. The import it was written for removed itself before #79 reached the
environment.
