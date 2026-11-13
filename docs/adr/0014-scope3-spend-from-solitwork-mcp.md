# 14. Scope 3 spend from the AFC cube through Solitwork's MCP server

- **Status:** Proposed
- **Date:** 2026-11-11
- **Decided by:** pending, @mortengad (tech lead). The request (2026-11-11) is to connect
  Scope 3 to the custom MCP server Solitwork built for Heartland.

## Context

Scope 3 category 1 (purchased goods and services) is spend-based. Postings are imported from a
CSV or XLSX ledger export (ADR 0004). Rules, or manual tagging, then assign each posting to a
category and an EXIOBASE spend factor (`src/calc/ledger.ts`, `src/calc/spend.ts`). The same
tagged postings can also feed other spend-based categories (capital goods, courier freight in
category 4, travel in category 6). Today someone has to export a file from the finance system
for every company, every period.

Heartland's finance data is in the **AFC cube**, a tabular model on Azure Analysis Services
maintained by Solitwork. Solitwork exposes it through a remote MCP server, which is packaged as
the Copilot Cowork agent *Heartland Finance* (`heartland-finance-cowork/`, outside this repo):

- **Endpoint:** `https://mcp-heartland-azure-as.azurewebsites.net/mcp` (Streamable HTTP).
- **Tools:** read-only. `run_dax` runs the queries; `list_models`, `list_tables`,
  `list_columns`, `list_measures`, `get_relationships`, `list_calculation_groups`,
  `get_measure_definition` and `refresh_schema` describe the model.
- **Limits:** queries time out after 30 seconds, results come in pages (check `has_more`), and a
  top-level `ORDER BY` is rejected.
- **Authorisation:** OAuth 2.1. The server is its own authorization server: it supports dynamic
  client registration, authorization code with PKCE, scope `access_as_user`, and client secrets
  at the token endpoint (`client_secret_post`/`client_secret_basic`). Every query runs as the
  signed-in user, so the cube's row-level security applies.
- **CORS:** none. A preflight from `https://apps.powerapps.com` returned 401 with no
  `Access-Control-Allow-*` headers (checked 2026-11-11).

What the cube holds, per Solitwork's skill reference (`references/finance/model.md`, written
2026-10-01):

- **Fact table:** `Finance`, with `Account` (1,893 accounts), `Vendor` (4,472),
  `Organization` (~585 legal entities, 513 under `Group Heartland A/S`), `Period` and `Date`
  (posting date).
- **Measures:** `Value DKK` is raw, debit positive; the other currencies are siblings of it.
- **The fiscal year runs August to July.** `PeriodNo` 202501 is August 2025.
- **Two views that must never be summed.**
  - `Ekstern` holds the subsidiaries' annual accounts. They land in July through source
    `Assignment`; the other months carry only the `Navision External` ERP stream.
  - `Intern` holds the monthly ERP stream (`Navision`, 92 entities), among others.
- **ESG content.** There are `ESGScope`, `ESGEF`, `ESGCategory` and `ESGUnit` tables,
  `kgCO2-e`/`tCO2-e` measures, a `Carbon Accounting` source, and separate `ESG` and `ESGCA`
  catalogs on the same server. Solitwork's skill treats them as out of scope; what they hold is
  unknown to this project.

The app is a Power Apps code app. Its Content Security Policy blocks every host until an admin
adds it to `connect-src` (ADR 0011).

## Decision

1. **The cube becomes a second source of ledger postings, next to the file import.** Rows from
   the cube are turned into the same `Posting` records as a CSV row: date, account, account
   name, supplier, text, amount, currency. They then go through the existing rules, manual
   tagging, spend factors and deflation unchanged. Nothing downstream knows where a posting came
   from, except its import record, which names the source (`AFC · <Organization> · <period>`).
2. **The extract is one fixed, reviewed DAX query, kept in the repo** (`src/afc/spendQuery.ts`).
   - **Measure and scenario:** `Value DKK` (raw, debit positive) on `Analysis = "Actual"`.
   - **Rows:** one per `Organization`, `Account`, `Vendor` and calendar month, using the
     `Period` time-calculation item at each `PeriodNo`.
   - **Accounts:** only expense accounts on the P&L, so the balance sheet, revenue and
     intercompany are left out. The exact account filter is set once the open questions below
     are answered.
   - **Months:** the calendar months of the company's selected fiscal period (ADR 0013), each
     posting dated on the month's first and last day. Lines then split by days as they already
     do.
   - **Currency:** amounts arrive in DKK, at AFC's own rates. The posting says so in its text.
   - **Never mixed:** one view and its sources, as set in the query, never `Ekstern` and
     `Intern` together.
3. **Companies are mapped to AFC by `OrganizationID`.** `hlesg_virksomhed` gets a text column,
   `hlesg_afcorganizationid`, set on the Koncern page. A company without one can't be fetched
   and is told so. One company can map to several organizations, if AFC splits it.
4. **Re-fetching doesn't double-count.** A fetch for a company and month that has already been
   imported from AFC replaces that import's postings, keeping manual tags by account and
   supplier. Postings imported from a file are left alone. If a month already has file postings,
   the user is warned.
5. **The MCP server is called server-side, never from the browser.** The browser can't call
   it: there is no CORS, the token endpoint expects a client secret, and a secret can't live
   in a code app. Two steps:
   - **Now (no new infrastructure):** a person with the *Heartland Finance* agent, or any MCP
     client signed in to the server, runs the query from decision 2 and saves the result as
     CSV. The query and the expected columns are in the repo; the existing ledger import reads
     the file. The import record names the file and says it came from AFC.
   - **Next:** an Azure Function behind the API Management instance from ADR 0009/0010 calls
     `run_dax` for the user, and the app calls API Management with the user's Entra token, as
     ADR 0010 already does. This needs one of these from Solitwork:
     - (a) the MCP server accepts Entra access tokens, so the Function can use on-behalf-of;
     - (b) a registered confidential client for the Function, with the authorization-code
       flow and refresh tokens per user in Key Vault;
     - (c) an app-only identity with row-level security set for it.

     Option (a) keeps "runs as the signed-in user" and stores no tokens, so it's preferred.
6. **Only Heartland's own figures leave the cube, and only into Dataverse.** The query returns
   only the accounts and vendors that spend factors need. Nothing from the cube is sent to the
   AI review model (ADR 0002) beyond what the lines already hold.

## Options considered

- **Call the MCP server from the browser, like Eloverblik (ADR 0011).** Rejected for now. The
  server has no CORS, and its token endpoint needs a client secret, which can't be kept in a
  code app. Solitwork could add CORS and a public PKCE client. Even then, the sign-in redirect
  inside the Power Apps iframe is unproven.
- **Query Azure Analysis Services directly over XMLA (ADOMD.NET in a Function, on-behalf-of).**
  Not chosen. It avoids depending on an interface built for AI agents, and AAS accepts Entra
  tokens natively. But the request was to use Solitwork's MCP, and Solitwork maintains the model
  and its access rules there. This stays the fallback if the MCP's auth can't serve an app.
- **Let an AI agent in the app use the MCP as a tool.** Rejected. Emission figures must come
  from a fixed query whose result can be checked again, not from an agent's choice of query.
- **Use the cube's own ESG measures (`kgCO2-e`, `ESGEF`) instead of our spend factors.** Not
  decided; see the open questions. If Solitwork already calculates Scope 3 in the `ESG`
  catalog, this app should read results from there rather than duplicate the calculation.
- **Keep the file import only.** The import keeps working; the cube removes the export by hand
  and gives every company the same account and vendor keys.

## Open questions

1. **Which view and sources carry account- and vendor-level spend per month?**
   - `Ekstern` lands annual accounts in July, through `Assignment`, probably without
     `Vendor`.
   - `Navision`/`Navision External` are monthly, but cover only 92–117 entities.
   - Companies outside Navision may only have annual totals, which would be one posting per
     account per year.

   This needs a probe through the MCP server by someone with access.
2. **What do the `ESG`/`ESGCA` catalogs and the `Carbon Accounting` source hold?** If it's an
   existing carbon accounting, which one is authoritative? Ask Solitwork.
3. **Which of the auth options in decision 5 will Solitwork support?** Also: is a service
   identity on the cube acceptable to Heartland at all?
4. **Does row-level security on the cube match the app's roles?** The app's roles are
   *Bidragyder*/*Ansvarlig* per company (ADR 0005/0006). A user who can see a company in the
   app may not see it in the cube, and the other way round.
5. **Is AFC's DKK conversion acceptable** for spend that EXIOBASE prices in EUR? The app
   already converts DKK to EUR at its own rates.

## Consequences

- No new infrastructure for the first step: a documented query and the existing import.
- `hlesg_virksomhed` gets one new column (`hlesg_afcorganizationid`), applied with
  `dataverse-apply` per environment.
- The Function step adds API Management configuration, a Function and a CSP entry for the API
  Management host. It's blocked on Solitwork for the auth option.
- The fiscal-year mismatch (AFC August–July, companies' own periods in ADR 0013) is handled by
  fetching calendar months, not fiscal years.
- If the open questions show that only annual totals exist for most companies, the cube
  replaces the file import for those companies but gives no monthly detail.
