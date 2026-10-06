# 5. Storage in Dataverse: tables, security roles and an interim browser store

- **Status:** Accepted by @mortengad (tech lead) on 2026-10-06. Section 3's "one climate
  account per environment" is replaced by ADR 0006.
- **Date:** 2026-09-30
- **Proposed to:** @mortengad (tech lead)
- **Decided so far:** the publisher prefix `hlesg`; one climate account per environment; 7-year retention, then archive; reported periods locked, and reopenable by *Ansvarlig* with a reason; @mortengad is *Ansvarlig* (all 2026-09-30)

## Context

The account lives in the browser's memory and is lost when the page closes. ADR 0001 chose
Dataverse for storage, with its security roles enforcing permissions on the server. In a code
app, Dataverse is reached through services the Power Apps CLI generates from real tables
(`pa app add data-source --connector dataverse --table <name>`), with `create`, `get`,
`getAll`, `update` and `delete`
([Microsoft Learn](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/connect-to-dataverse)).
That needs a Power Platform environment with the tables in it, and none exists yet
(`docs/deploy.md`).

## Decision

### 1. One seam for storage (done)

- The whole account is one versioned object, `AccountData` (`src/storage/account.ts`).
  `parseAccount` validates it and drops records the app couldn't use, reporting how many.
- The app only talks to an `AccountStore` (`src/storage/store.ts`) with `load`, `save` and
  `clear`. Moving to Dataverse replaces that one implementation.
- Ids are random UUIDs, which Dataverse can use as primary keys unchanged.

### 2. An interim browser store (done, temporary)

Until Dataverse exists, `browserStore` keeps the account in the browser's `localStorage`, with
autosave. The app says so on every page: **"Kladde: data gemmes kun i denne browser, ikke
centralt, og deles ikke med andre."** Backup export and import as JSON are there to protect
against lost browser data, and they'll also be the way to bring drafts into Dataverse. This
store is **not** the product's storage.

**Since 2026-10-06 (proposed, awaiting @mortengad's confirmation):** the Dataverse store exists
(`src/storage/dataverse/`), and the app uses it whenever it runs inside Power Apps, which is
always the case for users. The browser store is kept, instead of removed, for one case only:
local development with `npm run dev` opened directly, outside Power Apps, where there's no
Dataverse connection. The draft notice stays on every page there. `src/storage/choose.ts`
decides: a page that isn't framed by Power Apps, or whose host doesn't answer within 4 seconds,
uses the browser.

### 3. Tables

These use the publisher prefix **`hlesg`**, decided by @mortengad on 2026-09-30, so table
names start with `hlesg_`. All tables are user or team owned.

**Replaced by ADR 0006 on 2026-10-01:** an environment now holds a group of companies, each with its own account. What follows was the original decision. **There was one climate account per environment** (decided by @mortengad on 2026-09-30). The
account's settings are a single row, and the other tables don't need a lookup to an account.
Another company or subsidiary gets its own environment, with its own data and access.

| Table | Holds | Notes |
| --- | --- | --- |
| `hlesg_klimaregnskab` | The account's settings: name, period, category 3 parameters | One row per company (ADR 0006); originally one per environment |
| `hlesg_linje` | Every line with quantity or amount: Scope 1, Scope 2 (with location), categories 1, 5 and 6 | One table, as in the original's `linjer`. Columns: scope, category, type (group), date, end date, quantity, amount, currency, factor id, custom factor, description |
| `hlesg_lokation` | Scope 2 locations: market instrument, heating factor | |
| `hlesg_pendling` | Commuting surveys | The answers per mode (9 modes × 5 numbers) go in one JSON column |
| `hlesg_investering` | Category 15 holdings | |
| `hlesg_faktorkilde` | The chosen source per factor: built-in table, a publication, an API, or a value entered by hand with its source and date (`FactorSourceChoice` in `src/calc/factorSources.ts`) | A separate table so auditing shows who chose which source or value, and when |
| `hlesg_relevans` | Relevance and justification per Scope 3 category | |
| `hlesg_indekspunkt` | Price-index values per series and year, and base year per spend factor | |
| `hlesg_import`, `hlesg_postering`, `hlesg_regel` | Ledger imports, postings (with the manual action as columns) and rules | Rule conditions go in a JSON column |

The factor table itself stays in the code (`src/data/factors.ts`), versioned and reviewed like
the rest of it, and so do the official publications a factor can be taken from
(`src/data/factorPublications.ts`). Only the *choice* of source is stored, plus the value itself
when it was entered by hand or fetched from an API.

### 4. Security roles, enforced by Dataverse

| Role | Can |
| --- | --- |
| **Klimaregnskab – Læser** | Read everything in the account |
| **Klimaregnskab – Bidragyder** | Also create, change and delete lines, surveys and investments, and import and tag ledger postings |
| **Klimaregnskab – Ansvarlig** | Also change the account's settings and locations, choose factor sources, change rules, relevance and index values, and delete imports |

- **Decided by @mortengad on 2026-10-06:** *Bidragyder* may delete lines, surveys and
  investments in their own company, to correct mistakes. Deleting a whole import stays with
  *Ansvarlig*. Scope 2 locations are *Ansvarlig*'s, because a location's market instrument and
  heating factor change the totals.
- The exact privileges per table are code: `src/dataverse/roles.ts`, with tests, applied by
  `npm run dataverse:apply` (ADR 0007).
- Users also get Microsoft's **Basic User** role, for the platform privileges every app needs.
  These roles add only the `hlesg_` tables.
- Access is at **business-unit level**.
- **Who holds which role (decided by @mortengad on 2026-09-30):**
  - **@mortengad is *Ansvarlig*,** assigned directly to the user, and also holds both group roles
    from ADR 0006, *Koncern – Læser* and *Koncern – Ansvarlig* (decided 2026-10-06).
  - ***Bidragyder* and *Læser*** are granted later to Dataverse teams linked to **Entra ID
    security groups**, so that access is managed in Entra, not per user. The groups don't exist
    yet.
  - **Risk:** with a single *Ansvarlig*, only one person can reopen periods, choose factor sources,
    change ledger rules or delete imports. A second *Ansvarlig* (a deputy) is recommended when
    the Entra groups are set up.
- The app may hide what a role can't do, but that's presentation only. Every request is
  checked by Dataverse, which meets the *authorisation checked server-side* guardrail.
- **Auditing is on** for all `hlesg_` tables, so every change records who made it and when. This
  also covers the "a person made every change" trail that ADR 0002 needs for AI suggestions.

### 5. Retention: 7 years, and how

@mortengad decided on 2026-09-30 that data is kept for **7 years**.
- **The audit log** is set to retain entries for 7 years (2,557 days) *before go-live*. Dataverse
  applies a changed retention period only to entries created after the change
  ([Microsoft Learn](https://learn.microsoft.com/power-platform/admin/manage-dataverse-auditing)).
- **Account data** is kept for at least 7 years after the end of the period it belongs to, and
  **then archived to Dataverse long-term retention** (decided by @mortengad on 2026-09-30). That
  means a solution-aware retention policy, built and tested in dev and moved with the solution
  ([long-term retention](https://learn.microsoft.com/power-apps/maker/data-platform/data-retention-overview)).
  - Archived data is **read-only** and can't be brought back into active use.
  - **It needs a Managed Environment**, which an admin switches on per environment. It adds no
    licensing: code-app users already need Power Apps Premium (ADR 0001).
  - Archived rows can only be queried with FetchXml (`datasource="retained"`), not through the
    app's generated services. Viewing archived periods would need a separate read-only view,
    which isn't planned yet.

### 6. Locking reported periods, and how

@mortengad decided on 2026-09-30 that **reported periods are locked**.

- **A new table, `hlesg_rapportering`,** records each reported period: the period, when it was
  reported and by whom, and an **immutable snapshot** of what was reported (all inputs and totals,
  as `AccountData` plus the calculated figures, as JSON). Blocking edits alone doesn't lock a
  period's numbers, because account-wide settings also change them: chosen factor sources,
  category 3 parameters, relevance, ledger rules and price deflation. The snapshot is the record of
  the report; later changes to settings can't alter it.
- **Enforced on the server by a Dataverse .NET plug-in** (pre-operation, on create, update and
  delete). It rejects any change to a line, survey, investment or posting whose dates fall in a
  locked period, and any change to or deletion of a `hlesg_rapportering` row, with **one
  exception: reopening**.
- **Reopening (decided by @mortengad on 2026-09-30):** a user with the *Klimaregnskab – Ansvarlig*
  role can reopen a reported period by setting its report's status to *reopened* with a
  **required reason**. The plug-in checks both the role and the reason; everything else on the
  row, including the snapshot, stays unchangeable. Reopening is audited. When the period is
  reported again, a new `hlesg_rapportering` row with a new snapshot supersedes the old one,
  which is kept. So every version that was ever reported survives. Security roles
  can't express a rule based on dates, and Dataverse's low-code (Power Fx) plug-ins are still in
  preview, "not meant for production use"
  ([Microsoft Learn](https://learn.microsoft.com/power-apps/maker/data-platform/low-code-plug-ins)).
  The plug-in adds a small C# project to the solution, built and unit-tested in CI.
- **The app** shows locked periods, disables editing there (presentation only), and warns when an
  account-wide setting is changed that the reported snapshot is kept as it was.

### 7. Saving to Dataverse

Per record, not per account: the app keeps what it loaded, and on save it sends only the
records that were created, changed or deleted, with only the changed columns (as Microsoft's
guidance says, so auditing isn't polluted by false updates).

Built 2026-10-06 in `src/storage/dataverse/`:
- **`rows.ts`** turns the group into rows and back, and works out the changes (`diff`): parents
  are created before children and deleted after them, and records that go with a deleted company
  or import aren't sent separately.
- **`store.ts`** loads every table and saves the changes one by one. If a save fails, what got
  through stays recorded, so the next save sends only the rest. Records the app gives an id use
  it as their primary key; the others (ownership shares, factor sources, relevance, index values,
  base years, settings) are matched on their natural key, such as company and year.
- **`generated.ts`** connects the store to the services the Power Apps CLI generates in
  `src/generated` (`pa app add data-source --connector dataverse --table <name>`, one per table).
- **What users can't read isn't loaded,** and a change their role doesn't allow fails with
  Dataverse's message, shown in the app.
- **The open company and the summary period** are each user's view, kept in their browser, not
  in Dataverse.
- **"Ryd alt"** (clear everything) only exists for the browser draft; shared data isn't cleared
  from the app.
- **A company created in the app** is owned by its creator in the root business unit. Running
  `npm run dataverse:company -- --name "<company>"` assigns it to the company's owner team, and
  its records follow (ADR 0006).

## Options considered

- **The whole account as one JSON document in one row (rejected).** It's the simplest option,
  but there's no auditing per record, two people editing overwrite each other, and a large
  ledger import can exceed the column size limit (about 1 MB for text).
- **A table per line type (rejected for now).** Scope 1, categories 1, 5 and 6 and Scope 2 lines
  share almost all their columns. One `hlesg_linje` table keeps the model small, as in the original.
- **Lock periods in the app only (rejected).** Hiding edit buttons is presentation; any other
  client or a direct Web API call could still change reported data.
- **Lock with a low-code Power Fx plug-in (rejected for now).** It's server-side and simpler, but a
  preview feature. Revisit when it's generally available.
- **Delete data after 7 years with bulk deletion (rejected by the tech lead).** It's simpler and
  needs no Managed Environment, but the history would be gone. Archiving keeps it read-only.
- **Keep the browser store (rejected).** Data isn't shared, is lost when site data is cleared,
  and permissions can't be enforced. That's why ADR 0001 chose Dataverse.

## Consequences

- Separate companies are separated by environment, so their data and access can't mix, and
  there is no account picker in the app.
- Nothing further happens until an environment exists. The next steps are:
  1. Create the tables and roles in a solution in dev.
  2. `pa app add data-source` for each table.
  3. A `dataverseStore` implementing `AccountStore`.
  4. Remove `browserStore`.
- Tables and roles move between environments in the solution, alongside the app. This is the
  point where ADR 0003's solution-based promotion comes due.
- Drafts made in the browser can be brought in by importing their backup file once the
  Dataverse store exists.

## Open questions

None. All were answered by @mortengad on 2026-09-30: people per role (section 4), unlocking and
retention (sections 5 and 6), the publisher prefix and one account per environment (section 3).
**Still to do when the Entra groups are created:** name the *Bidragyder* and *Læser* groups,
and consider a second *Ansvarlig*.
