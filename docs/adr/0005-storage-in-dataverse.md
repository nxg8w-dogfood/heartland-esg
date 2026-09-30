# 5. Storage in Dataverse: tables, security roles and an interim browser store

- **Status:** Proposed. Accepted once the tech lead signs it off and the open questions below
  are answered.
- **Date:** 2026-09-30
- **Proposed to:** @mortengad (tech lead)
- **Decided so far:** the publisher prefix, `hlesg` (2026-09-30)

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

| Table | Holds | Notes |
| --- | --- | --- |
| `hlesg_klimaregnskab` | One climate account: name, period, category 3 parameters | The parent of everything below |
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

### 5. Saving to Dataverse (proposed)

Per record, not per account: the app keeps what it loaded, and on save it sends only the
records that were created, changed or deleted, with only the changed columns (as Microsoft's
guidance says, so auditing isn't polluted by false updates).

## Options considered

- **The whole account as one JSON document in one row (rejected).** It's the simplest option,
  but there's no auditing per record, two people editing overwrite each other, and a large
  ledger import can exceed the column size limit (about 1 MB for text).
- **A table per line type (rejected for now).** Scope 1, categories 1, 5 and 6 and Scope 2 lines
  share almost all their columns. One `hlesg_linje` table keeps the model small, as in the original.
- **Keep the browser store (rejected).** Data isn't shared, is lost when site data is cleared,
  and permissions can't be enforced. That's why ADR 0001 chose Dataverse.

## Consequences

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

1. **One account or several:** one climate account per environment, or several (for example
   per company or subsidiary)? The model supports several; the UI currently assumes one.
2. **People per role:** who is *Ansvarlig*, *Bidragyder* and *Læser*, and which Entra groups
   hold them?
3. **Retention:** how long must accounts and imported postings be kept, and must old periods
   be locked once reported?
