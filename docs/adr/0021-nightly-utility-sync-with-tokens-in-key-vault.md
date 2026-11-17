# 21. A nightly sync fetches electricity and heating, with each company's tokens in Key Vault

- **Status:** Proposed
- **Date:** 2026-11-16
- **Decided by:** @mortengad (tech lead), 2026-11-16: tokens are stored per company, so that
  consumption keeps coming in without anyone pasting a token. They are stored in Key Vault, not
  on the company in Dataverse, and a nightly Azure Function does the fetching.
- **Builds on:** ADR 0011 (fetching from the browser) and ADR 0010 (draft PR #48, API Management).
  ADR 0011 stays: pasting a token in the app still works for a one-off import.

## Context

With ADR 0011, someone has to paste a token and click *Hent forbrug*. Heartland wants the
consumption to keep arriving on its own. The tokens aren't critical data: each one only reads a
company's own meter data. They are still credentials, though, and the brief says credentials
live in Key Vault.

A browser only runs while the app is open. A data stream therefore needs something on the
server that runs on a schedule, holds the tokens, and writes lines to Dataverse. ADR 0010 already
proposed that design.

## Decision

1. **Tokens live in Key Vault, one secret per company and service.** They go in the
   environment's existing vault, the one MotorAPI uses (ADR 0009). The secret names are
   `eloverblik-<company id>` and `varmeoverblik-<company id>`, using the company's
   `hlesg_virksomhedid`.
   - For now, an administrator adds each token with `az keyvault secret set`. The README
     describes this.
   - Replacing a token means setting a new version of the secret. Removing the secret stops the
     sync for that company.
2. **A nightly Azure Function fetches and imports** (`functions/utility-sync/`).
   - It runs on a timer, daily at 02:00 UTC, and can also be started by hand.
   - For each company with a secret, it fetches the last 13 completed months and imports what's
     new.
   - It reuses the app's own code: `src/utility/` for fetching and the monthly maths, and
     `planImport` to avoid importing a month twice. Results are therefore the same as a manual
     fetch.
   - It reads secrets and Dataverse with its **managed identity**, so it holds no credential of
     its own.
3. **Meters are records** (new table `hlesg_maaler`). There is one row per meter per company,
   holding the source, the meter ID, the address, the municipality, the location, when it was
   last fetched, and the last error.
   - The Function adds the meters it finds.
   - A new meter has no location, so the Function **doesn't import it**. It waits until someone
     picks a location in the app, or creates a new one from the meter, as in ADR 0012.
   - After that, the meter's months come in every night.
4. **Imported lines belong to the company.** The Function creates them owned by the company
   record's owner, which is the company's owner team (ADR 0006). The company's users therefore see
   them as if they had entered them.
5. **The app shows the stream.** Scope 2 lists the company's meters, each with its location,
   when it was last fetched and any error. A meter without a location is flagged. Lines from
   the sync look like lines from a manual fetch.
6. **Its own security role.** The Function's application user gets a role, *Klimaregnskab –
   synkronisering*. It can read companies, locations and Scope 2 lines in every company, and
   create lines and meters. It can't delete anything (`src/dataverse/roles.ts`).

## Consequences

- **New Azure resources** (`infra/utility-sync/main.bicep`) in each environment's resource
  group:
  - a Function App on the Flex Consumption plan;
  - its storage account;
  - Application Insights;
  - a monthly budget with alerts at 50, 80 and 100 %.

  They are tagged owner, project and environment, as the cost policy requires. At one run a
  night, the cost should stay within the free grant.
- **Setup per environment, partly by hand:**
  - the Dataverse application user for the managed identity, with the new role;
  - the tokens in Key Vault;
  - the pipeline's access to deploy the Function (`docs/deploy.md`).
- **The Function's code is deployed from the pipeline** (`deploy.yml`), like the app.
- **Up to a day's delay.** A month appears the night after it ends and its readings are in.
  *Hent forbrug* is still there for an immediate fetch.
- **Fetching inside Power Apps no longer depends on the CSP for daily use.** Only the manual
  fetch needs `connect-src` (ADR 0011).
- **A token that stops working** shows as an error on the company's meters. Fetching other
  companies carries on.

## Rejected options

- **The token on the company in Dataverse, as a column with column-level security.** It's
  simpler and needs no waiver of the setup, but it breaks the rule that secrets live in Key
  Vault, and it still needs the same server-side job for the stream. Rejected 2026-11-16.
- **A scheduled Power Automate flow.** It can read a Key Vault-backed environment variable, but
  that means one variable per company and service. It also can't reuse the TypeScript for the
  heating maths, so the maths would be maintained twice.
- **Fetch when someone opens the app.** That isn't a stream: nothing comes in while no one opens
  it, and the token would still have to reach the browser.

## Open questions

- **Entering the token in the app.** A person who isn't an Azure administrator should be able to
  set a company's token. *Proposed follow-up:* a write-only endpoint on the Function, reached
  through a custom connector as MotorAPI is (ADR 0009). It would write the secret, so the token
  is never read back.
- **How far back the first sync goes.** 13 months covers last year's report. An older year would
  still need a manual fetch.
