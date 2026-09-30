# 5. Storage in Dataverse: tables, security roles and an interim browser store

- **Status:** Proposed. Accepted once the tech lead signs it off and the open questions below
  are answered.
- **Date:** 2026-09-30
- **Proposed to:** @mortengad (tech lead)
- **Decided so far:** the publisher prefix `hlesg`; one climate account per environment; 7-year retention, then archive; reported periods locked, and reopenable by *Ansvarlig* with a reason (all 2026-09-30)

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
store is **not** the product's storage. It's removed when the Dataverse store is in place.

### 3. Tables (proposed)

These use the publisher prefix **`hlesg`**, decided by @mortengad on 2026-09-30, so table
names start with `hlesg_`. All tables are user or team owned.

**There is one climate account per environment** (decided by @mortengad on 2026-09-30). The
account's settings are a single row, and the other tables don't need a lookup to an account.
Another company or subsidiary gets its own environment, with its own data and access.

| Table | Holds | Notes |
| --- | --- | --- |
| `hlesg_klimaregnskab` | The account's settings: name, period, category 3 parameters | Exactly one row per environment |
| `hlesg_linje` | Every line with quantity or amount: Scope 1, Scope 2 (with location), categories 1, 5 and 6 | One table, as in the original's `linjer`. Columns: scope, category, type (group), date, end date, quantity, amount, currency, factor id, custom factor, description |
| `hlesg_lokation` | Scope 2 locations: market instrument, heating factor | |
| `hlesg_pendling` | Commuting surveys | The answers per mode (9 modes × 5 numbers) go in one JSON column |
| `hlesg_investering` | Category 15 holdings | |
| `hlesg_faktorvaerdi` | Values entered for factors that ship blank (residual mix, local heating, …) | A separate table so auditing shows who entered which value, and when |
| `hlesg_relevans` | Relevance and justification per Scope 3 category | |
| `hlesg_indekspunkt` | Price-index values per series and year, and base year per spend factor | |
| `hlesg_import`, `hlesg_postering`, `hlesg_regel` | Ledger imports, postings (with the manual action as columns) and rules | Rule conditions go in a JSON column |

The factor table itself stays in the code (`src/data/factors.ts`), versioned and reviewed like
the rest of it. Only *entered* values are stored.

### 4. Security roles, enforced by Dataverse (proposed)

| Role | Can |
| --- | --- |
| **Klimaregnskab – Læser** | Read everything in the account |
| **Klimaregnskab – Bidragyder** | Also create and change lines, surveys, investments and imports |
| **Klimaregnskab – Ansvarlig** | Also enter factor values, change rules, relevance and index values, and delete imports |

- Access is at **business-unit level**. The roles are granted to Dataverse teams linked to
  **Entra ID security groups**, so access is managed in Entra, not per user.
- The app may hide what a role can't do, but that's presentation only. Every request is
  checked by Dataverse, which meets the *authorisation checked server-side* guardrail.
- **Auditing is on** for all `hlesg_` tables, so every change records who made it and when. This
  also covers the "a person made every change" trail that ADR 0002 needs for AI suggestions.

### 5. Retention: 7 years (decided), and how (proposed)

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

### 6. Locking reported periods (decided), and how (proposed)

@mortengad decided on 2026-09-30 that **reported periods are locked**.

- **A new table, `hlesg_rapportering`,** records each reported period: the period, when it was
  reported and by whom, and an **immutable snapshot** of what was reported (all inputs and totals,
  as `AccountData` plus the calculated figures, as JSON). Blocking edits alone doesn't lock a
  period's numbers, because account-wide settings also change them: entered factor values,
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

### 7. Saving to Dataverse (proposed)

Per record, not per account: the app keeps what it loaded, and on save it sends only the
records that were created, changed or deleted, with only the changed columns (as Microsoft's
guidance says, so auditing isn't polluted by false updates).

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

1. **People per role:** who is *Ansvarlig*, *Bidragyder* and *Læser*, and which Entra groups
   hold them?
*(Unlocking and the after-7-years policy were decided on 2026-09-30; see sections 5 and 6.)*
