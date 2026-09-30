# 3. Deploy by publishing to each environment from GitHub Actions

- **Status:** Accepted
- **Date:** 2026-09-30
- **Decided by:** @mortengad (tech lead). The environments are named `dev`, `test` and `prod`.

## Context

The guardrail requires deploys to run from the pipeline, not a laptop, with each
environment configured separately. ADR 0001 made the app a Power Apps code app, which the
Power Apps CLI publishes with `pa app push`. The CLI can sign in as a service principal for
CI/CD, but only with a client secret. That service principal can only update an app that a
maker has already published and shared with it
([Microsoft Learn](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/use-service-principal)).

## Decision

One GitHub Actions workflow, `.github/workflows/deploy.yml`, publishes the app with
`pa app push --non-interactive` to one GitHub environment per Power Platform environment:

- **dev** deploys on every push to `main`. **test** and **prod** deploy only when started by
  hand. Runs from branches other than `main` are refused.
- Each environment has its own service principal, `power.config.json` (committed under
  `deploy/<env>/`) and GitHub environment variables and secret.
- Each run lints, tests and builds before publishing.
- The CLI is a pinned dev dependency, so the lockfile fixes its version and Dependabot
  updates it.
- The one-time first publish and share per environment is done by a maker, as documented
  in `docs/deploy.md`. Power Platform doesn't allow it any other way.

## Options considered

- **Promote a managed solution (export from dev, import to test and prod) (not now).** It's
  the standard Power Platform approach, and it moves tables, connectors and the app together
  as one tested package. Today there's only the app to move, and solution packaging adds the
  Power Platform CLI (`pac`) and more pipeline. **Revisit when the Dataverse tables and the
  custom connector from ADR 0002 exist**, because they must reach every environment in step
  with the app.
- **Power Platform pipelines (in-product) (rejected).** Deploys would be started and tracked
  in Power Platform rather than from the repository, so the repository would no longer be
  the single place deploys come from.
- **Deploy test and prod automatically after dev (rejected).** Every merge would reach
  production with no human decision, and required reviewers on GitHub environments may not
  be available on the organisation's plan for private repositories.

## Consequences

- Client secrets expire and must be rotated. `docs/deploy.md` describes how.
- Until an environment is set up, its deploy run warns and does nothing, so merges to
  `main` don't fail for that reason.
- Test and prod are rebuilt from `main` at deploy time, not promoted from the dev build. A
  test deploy and a prod deploy of the same commit produce the same build, because the
  dependencies are locked.
