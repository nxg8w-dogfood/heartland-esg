# 35. Scope 3 lines and commuting surveys have documents, in a table each

- **Status:** Accepted
- **Date:** 2026-11-24
- **Decided by:** @mortengad (tech lead), 2026-11-24: "For each scope 3 line - we need to be able
  to add a file for documentation - like we have on cat 15."

## Context

ADR 0029 gave a category 15 holding its own documents: a `hlesg_dokument` row per file, with the
file in a file column, belonging to the holding through a parental lookup. The other Scope 3
figures need the same: an invoice behind a purchase, a carrier's statement behind freight, the
waste company's report, a travel agency's statement, the answers behind a commuting survey.

Those are rows of `hlesg_linje` (categories 1, 4, 5 and 6) and `hlesg_pendling` (category 7).
Dataverse lets a table have only one parental relationship, and deleting with the parent
(Cascade All) is only possible in a parental one; `hlesg_dokument`'s is its holding.

## Decision

1. **Two more document tables, shaped like `hlesg_dokument`:** `hlesg_linjedokument`, belonging to
   a line (`hlesg_linjeid`, parental), and `hlesg_pendlingsdokument`, belonging to a commuting
   survey (`hlesg_pendlingid`, parental). Each is owned, shared and deleted with its parent, and
   through it with the company.
2. **One document store per kind** (`investment`, `line`, `survey` in `src/storage/documents.ts`),
   all behaving as in ADR 0029: saved the moment a file is added or deleted, outside the group's
   autosave; a row whose upload fails is deleted again; up to 32 MB a file; only inside Power Apps.
3. **Where they show:** each line in categories 1 (entered lines), 4 (freight and courier), 5 and
   6 (activity lines) has a *Dokumenter* button next to *Slet* that opens its documents in a row
   below it, with the count once it has any. A commuting survey shows its documents at the bottom
   of its card, like a holding. Deleting a line or survey with documents asks first, since they go
   with it.
4. **Contributors add and delete documents** on their own company's lines and surveys, like the
   lines and surveys themselves (ADR 0005).

## Options rejected

- **More lookups on `hlesg_dokument`.** Only one can be parental, so a document on a line would
  be left behind (Remove Link) or block deleting the line (Restrict) when the line goes, and it
  wouldn't follow the line's owner.
- **One document table belonging to the company,** with the holding, line or survey as plain
  lookups. Same problem: nothing deletes a line's documents with the line.
- **Documents on ledger postings** (categories 1, 2 and 6 from Kontoplan). Postings come and go
  with their import; the import file is their documentation. Not part of this decision.

## Consequences

- Both tables were applied to dev on 2026-11-24 with `npm run dataverse:apply -- --no-roles`. As
  for ADR 0029, the roles' privileges for them aren't applied yet (`hlesg_maaler` from an
  unmerged branch would lose its own), so until they are only a System Administrator can add
  documents on dev. Test and production need the tables and the roles before this ships there.
- The tables are registered by hand in `dataSourcesInfo.ts` and `deploy/dev/power.config.json`,
  as `pa app add data-source` would; the CLI's sign-in had expired. A test checks every table is
  in both.
