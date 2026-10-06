# 7. The Dataverse schema is defined in code and applied by a script

- **Status:** Accepted
- **Date:** 2026-10-06
- **Decided by:** @mortengad (tech lead), 2026-10-06

## Context

ADR 0005 and 0006 decided which Dataverse tables, columns and roles the app needs. The tables now
need to be created in dev (orgb872058d), and later in test and prod, and kept in source control.
Dataverse tables are usually made by hand in make.powerapps.com, with the solution then exported
and unpacked into the repository as generated XML.

## Decision

- **The schema is TypeScript in the repository:** `src/dataverse/schema.ts` defines the publisher
  (`heartland`, prefix `hlesg`), the solution (`HeartlandESG`), and every table and column. Pull
  requests review it like any other code.
- **Tests guard it:** `src/dataverse/schema.test.ts` checks the rules Dataverse enforces (names,
  lengths, choice value ranges, one parental relationship per table), and that every part of a
  company's account has a table. `accountStorage` is typed against `AccountData`, so a new part of
  the account doesn't type-check until it's given a table.
- **A script applies it:** `npm run dataverse:apply -- --url <environment>` creates the publisher,
  the solution, and whatever tables, columns and lookups are missing, through the Dataverse Web
  API (`src/dataverse/metadata.ts` builds Microsoft's documented request shapes).
  - It **only creates**. It never changes or deletes anything that exists, and reports existing
    columns whose type differs instead of touching them, so it's safe to run again.
  - `--dry-run` lists what it would create, without changing anything.
  - It signs in through the Azure CLI (`az login`), so no credentials pass through the script or
    the repository.
- **Promotion to test and prod uses the solution:** the `HeartlandESG` solution is exported from
  dev with the Power Platform CLI (`pac`) and imported as a managed solution (ADR 0003). That
  pipeline step comes with the test environment.

### Design details (2026-10-06)

- **Record ids are the app's UUIDs,** used unchanged as primary keys (ADR 0005).
- **One parental relationship per table:** each company-owned table's lookup to
  `hlesg_virksomhed` cascades delete, assign and share. Postings belong to their import, and the
  import to its company, because Dataverse allows only one parental relationship per table.
- **`hlesg_koncern`** holds the group's name, one row per environment. It's added to the tables
  in ADR 0005.
- **Dates are date-only,** so a date never shifts with the user's time zone.
- **Labels are written in the environment's base language,** read from the environment.
- **Auditing is on** for every table (ADR 0005).
- **Not yet in the schema:** security roles, business units, the `hlesg_rapportering` snapshot
  table, and the locking plug-in (ADR 0005 section 6). They follow in their own pull requests.

## Options considered

- **Tables made by hand in the maker portal, solution exported as XML (rejected by the tech
  lead).** It's Microsoft's usual route, but the repository then holds generated XML. Changes are
  hard to review, and the schema in the repository follows the environment, not the other way round.
- **Hand-written solution XML (rejected).** It's verbose and undocumented as a format for
  authoring, and easy to break.

## Consequences

- A schema change is a pull request to `schema.ts`, then a run of the script against each
  environment until the solution pipeline exists.
- Changing an existing column (its type, length or choices) isn't automated. The script reports
  the difference, and the change is made deliberately, because Dataverse restricts most column
  changes once data exists.
