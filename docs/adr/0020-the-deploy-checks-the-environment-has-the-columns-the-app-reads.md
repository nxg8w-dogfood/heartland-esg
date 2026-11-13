# 20. The deploy checks the environment has the tables and columns the app reads

- **Status:** Accepted
- **Date:** 2026-11-13
- **Decided by:** @mortengad (tech lead), 2026-11-13

## Context

The app selects every column in `src/dataverse/schema.ts` when it loads
(`src/storage/dataverse/generated.ts`, `selectFor`). Dataverse rejects a request that selects a
column the table doesn't have, and the app loads every table up front, so one missing column
fails the whole load. The user sees no data at all, only the error.

The tables and columns are created by a separate script, run by hand against each environment
(ADR 0007). Nothing connects the two: the code can add a column and ship, while the environment
is still behind.

On 2026-11-13 that happened. ADR 0018 added four columns to `hlesg_regel`, the pull request
merged, the deploy published the app to dev, and `dataverse:apply` had not been run there. Every
load failed with:

> Could not find a property named 'hlesg_standardregel' on type 'Microsoft.Dynamics.CRM.hlesg_regel'

The app was unusable in dev for everyone until the script was run, and it cost most of an
afternoon. CI did not catch it and would not catch a repeat: the build and the tests check the
schema in code against itself, never against an environment.

## Decision

1. **The deploy checks the target environment before it publishes.** A new step runs
   `npm run dataverse:check -- --url <org>`, which reads the environment's metadata and compares
   it with `tables`. If anything the app selects is missing, the deploy fails and names it, and
   nothing is published.
2. **The comparison is a pure function**, `missingFromEnvironment()` in
   `src/dataverse/schemaCheck.ts`, so it is tested like any other code rather than only in a
   workflow. The script is the part that talks to Dataverse.
3. **The check is one-way.** Columns the environment has and the schema doesn't are fine: the
   app never asks for them, and the apply script never deletes anything anyway (ADR 0007).
4. **It reads metadata only.** It creates and changes nothing, so it is safe to run on every
   deploy, and safe to run by hand against any environment.
5. **An environment without `PA_DATAVERSE_URL` is skipped with a warning, not failed.** Not every
   environment is set up yet (`test` and `prod` are not), and a missing variable should not stop
   a deploy that otherwise works. The warning says what to set.
6. **CI does not run it.** A pull request has no environment to check against, and giving CI
   credentials to a Dataverse environment for every branch is a wider change than this problem
   needs. The deploy is the point where the two sides meet.

## Options considered

- **Run `dataverse:apply` from the deploy (rejected).** It would fix the mismatch rather than
  report it, but it changes the environment's schema from an automated pipeline, with the
  service principal needing permission to customize every environment it deploys to. ADR 0007
  deliberately keeps schema changes a deliberate act by a person who reads the dry run first.
  A deploy that silently alters the schema is worse than one that stops.
- **Check in CI instead (rejected).** See decision 6.
- **Have the app tolerate a missing column (rejected).** It could select only the columns the
  environment reports, and degrade. That hides the mismatch, gives the user data with silently
  missing fields, and makes the bug appear later and further from its cause.
- **A deploy-time warning instead of a failure (rejected).** The failure this prevents is total:
  the app does not load at all. Publishing anyway and warning in the log is the behaviour that
  caused the outage.

## Consequences

- A deploy to an environment behind the code now fails with, for example, `hlesg_regel is missing
  the column hlesg_standardregel`, and tells the reader to run `dataverse:apply`. The app in that
  environment keeps running the previous version instead of being taken down.
- Each environment needs `PA_DATAVERSE_URL` set as a GitHub environment variable. `docs/deploy.md`
  says so; until it is set, the deploy warns and skips the check, which is the behaviour before
  this ADR.
- The check costs one metadata request per table — 17 today — on each deploy.
- The same script is useful by hand: `npm run dataverse:check -- --url …` answers "is this
  environment up to date?" without changing anything, which the dry run of the apply script also
  does but with customization permissions.
