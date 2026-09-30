# 1. Rebuild as a Power Apps code app on Dataverse

- **Status:** Accepted
- **Date:** 2026-09-30
- **Decided by:** @mortengad (tech lead)

## Context

The only existing copy of Heartland ESG is a single compiled HTML file,
[`reference/heartland-klimaregnskab-app.html`](../../reference/heartland-klimaregnskab-app.html)
(about 1.7 MB, originally `Heartland_Klimaregnskab_App (1).html`), exported from the AI tool it
was built in. It is a minified React 19 build with no source map, so the original source
cannot be recovered.

The app works. It is a Danish greenhouse-gas accounting tool covering Scope 1, 2 and 3,
spend-based factors with price deflators, import from a chart of accounts, dual
reporting for Scope 2, and backups. But it has no backend: every user's data lives in that
browser's IndexedDB and localStorage.

With that file as the source, these guardrails cannot be met:

- **Automated tests** and **CI builds from a clean checkout**. There is nothing to install,
  lint, test or build.
- **Authorisation checked server-side**. There is no server.
- **Deployment automated per environment**. There is no environment configuration to vary.

The brief also describes the project as a Power Platform app, secured with Entra ID.

## Decision

Rebuild Heartland ESG as a [Power Apps code app](https://learn.microsoft.com/power-apps/developer/code-apps/overview):

- **UI:** React and TypeScript, built with Vite.
- **Data and permissions:** Dataverse. Access is enforced by Dataverse security roles on
  the server.
- **Sign-in:** Entra ID, provided by the platform.
- **Calculation engine:** a plain TypeScript module with its own unit tests.
- **Deployment:** the app is packaged in a Dataverse solution and published from the
  pipeline to each environment ([ALM for code apps](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/alm)).
- **Spec:** the existing HTML bundle is the functional specification for the rebuild.
  Its features and calculation results are the acceptance baseline.

## Options considered

### Rebuild as a standalone web app (rejected)

React and TypeScript, with Azure Functions, a database and Entra ID. This could meet every
guardrail, but it contradicts the brief's choice of Power Platform. It would also make us
build and run hosting, identity wiring, a data tier and TLS configuration that Power
Platform already provides.

### Host the existing bundle as it is (rejected)

Quickest, but it needs four guardrails waived and leaves an app nobody can safely change:
every fix would mean editing minified output. Data would stay in each user's browser, so
it can't be shared, backed up centrally or permission-checked.

### Canvas or model-driven app (rejected)

These use Dataverse and security roles too, but the calculation logic would have to be
rewritten in Power Fx or plug-ins. We would lose the React UI we already have as a
reference, and the logic would be harder to cover with unit tests in CI.

## Consequences

- **Licensing:** every end user needs Power Apps Premium, pay-as-you-go or an app pass.
  This is a cost and scope question for the product owner, and it must be settled before
  launch.
- **Environments:** each environment (for example dev, test and prod) needs Dataverse, and
  an admin must enable code apps on it in the Power Platform admin center.
- **Source control:** code apps don't support Power Platform Git integration. The GitHub
  repository is the source of truth, and the pipeline deploys with the Power Apps CLI
  (`pa app push`).
- **Tests:** the calculation engine can be tested in CI without Power Platform. Tests
  against a real environment need a service principal whose credentials live in GitHub
  environment secrets, never in the repository.
- **Effort:** the rebuild is real work. It should be sliced by feature (Scope 1, Scope 2,
  Scope 3 spend-based, import, reporting), and each slice checked against the existing
  app's results.

## Open questions

- **Runtime model.** The brief says the app ships a model (GPT-4o on Azure OpenAI is
  approved), but the current app uses none. Whether an AI feature is planned needs its own
  decision and ADR, including the token budget and per-request cap from the cost policy.

## Follow-up decisions

- **2026-09-30, the bundle is committed as the reference spec** under `reference/`, unchanged
  (@mortengad). It was scanned with gitleaks before being committed, and nothing was found.
  It isn't part of the build and must not be edited. Open it in a browser to compare
  behaviour.
