# Deploying Heartland ESG

Deploys run from `.github/workflows/deploy.yml`, never from a laptop:

| Environment | When it deploys |
| --- | --- |
| `dev` | Automatically, on every push to `main` |
| `test`, `prod` | Only when started by hand: **Actions → deploy → Run workflow**, then pick the environment |

The workflow only deploys from `main`. A manual run from any other branch is refused. Each
run installs, lints, tests and builds before publishing with the Power Apps CLI
(`pa app push --non-interactive`), signed in as a service principal
([Microsoft Learn](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/use-service-principal)).

Until an environment has been set up as described below, its deploy run ends with a warning
("isn't set up yet") and deploys nothing.

## Set up an environment (once per environment)

Repeat for `dev`, `test` and `prod`. Steps 1–3 need a Power Platform admin and an Entra
admin. Step 4 must be done by a person, because Power Platform requires it.

1. **Power Platform environment.** Create it with Dataverse, and turn on code apps: Power
   Platform admin center → **Manage → Environments →** the environment → **Settings →
   Product → Features → Power Apps code apps → Enable code apps**. Note the environment ID.
2. **Service principal.** In Entra, create an app registration for deployments (for example
   *Heartland ESG deploy (dev)*) with a client secret. Set an expiry and diary the rotation.
   Note the application (client) ID, the directory (tenant) ID, and the **Enterprise
   application** object ID. Don't use the app registration's object ID.
3. **Give the service principal access to the environment.** Add it as an application user
   in the Power Platform environment.
4. **First publish and share, by a maker.** The service principal can only update an app
   that already exists and has been shared with it, and it can't grant itself access. From a
   clean checkout of `main`:

   ```bash
   npm ci
   npm run build
   npx pa app init --display-name "Heartland ESG" --environment-id <environment-id>
   npx pa app push
   npx pa app share --principal <enterprise-application-object-id> --access edit
   ```

5. **Commit the environment's config.** Move the `power.config.json` that steps above wrote
   to `deploy/<environment>/power.config.json` and open a pull request. It holds IDs, not
   secrets. The root `power.config.json` is git-ignored so that a developer's own environment
   never gets committed by accident.
6. **GitHub environment.** Repository **Settings → Environments → New environment**, named
   exactly `dev`, `test` or `prod`:

   | Name | Kind | Value |
   | --- | --- | --- |
   | `PA_CLI_SP_CLIENT_ID` | Variable | Application (client) ID |
   | `PA_CLI_SP_TENANT_ID` | Variable | Directory (tenant) ID |
   | `PA_CLI_SP_CLIENT_SECRET` | **Secret** | The client secret |
   | `PA_CLI_SOLUTION_ID` | Variable, optional | Solution to add the app to |

   Under **Deployment branches**, allow `main` only. For `prod`, add required reviewers if
   the organisation's GitHub plan offers them for private repositories.

## Rotating the client secret

Create the new secret in Entra, update `PA_CLI_SP_CLIENT_SECRET` in the GitHub environment,
run a deploy to confirm it works, then delete the old secret in Entra.
