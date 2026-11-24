# 29. A category 15 holding has its own documents, stored as files in Dataverse

- **Status:** Accepted
- **Date:** 2026-11-18
- **Decided by:** @mortengad (tech lead), 2026-11-18. The documentation behind a holding, e.g. the
  company's own ESG report, must be kept with it, and a holding can have several files.

## Context

A holding's figures come from somewhere: the investee's own climate account or ESG report, its
annual report, the group's consolidation system. Until now a holding had only *Datakilde*, a line
of text. An auditor checking category 15 needs the document itself, and nothing in the app kept it.

Dataverse can store files three ways: a **file column** on a row (up to 10 GB, 32 MB by default,
outside the relational store), an **image column** (images only, 30 MB), or **notes**
(attachments to a row through a polymorphic lookup, limited by the environment's attachment
size, 5 MB by default). The Power Apps client the app uses (`@microsoft/power-apps` 1.6) uploads,
downloads and deletes file columns (`uploadFileToRecord`, `downloadFileFromRecord`), and doesn't
support polymorphic lookups, which notes need.

## Decision

1. **A new table, `hlesg_dokument`, has one row per document,** with the file in its file column
   `hlesg_fil` (up to 32 MB), and its name, size and type in columns of its own. A holding can
   have any number.
2. **A document belongs to its holding** (`hlesg_investeringid`, parental): it's owned, shared
   and deleted with the holding, and through it with the company. Deleting a holding deletes its
   documents, and the app says so before it does.
3. **Documents are saved the moment they're added or deleted,** not with the group's autosave.
   The group store leaves the table alone (`separate` in `src/dataverse/schema.ts`), so a save
   never touches a document. A document can only be added once its holding is saved, and the app
   waits for that.
4. **A row without its file is deleted again.** The row is created first, then the file uploaded
   to it; if the upload fails, the row goes and the user is told why.
5. **Contributors add and delete documents** on their own company's holdings, like the holdings
   themselves (ADR 0005); everyone who can read a holding can read its documents.
6. **Documents need Dataverse.** The browser draft (`npm run dev` on its own) says so instead of
   offering them.

## Options considered

- **One file column on the holding (rejected 2026-11-18).** Simpler, but a holding often has
  more than one document, such as an ESG report and an annual report.
- **Notes (annotations) on the holding (rejected).** The usual Dataverse attachment, but it
  needs a polymorphic lookup, which code apps don't support, and the 5 MB default is too small for
  an annual report.
- **A link to the document instead of the file (rejected).** It can't be audited later if the
  link moves or the file changes.
- **SharePoint (not chosen now).** Good for large libraries, but it needs a connector, a site and
  its permissions kept in step with Dataverse's.

## Consequences

- `hlesg_dokument` and its privileges have to be applied to each environment (ADR 0007) before
  this ships there; the deploy stops if the table is missing (ADR 0020). Dev has the table from
  2026-11-18, and its privileges are in dev's roles from 2026-11-24 (ADR 0035).
- The table is registered by hand in `dataSourcesInfo.ts` and `deploy/dev/power.config.json`, as
  `pa app add data-source` would; the CLI's sign-in had expired. A test checks every table is in
  both.
- Files count towards the environment's file capacity, not its database capacity.
- The 32 MB limit can be raised with the Web API, but not in the maker portal.
